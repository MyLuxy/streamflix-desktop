package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.utils.Log

import com.streamflixreborn.streamflix.models.*
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.MimeTypes
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

// own-hosted embed (no third-party iframe), and its /embed/resolve/{token} json api isn't behind
// any bot wall - plain requests work end to end, verified movie playback with a real range request.
// tv episodes currently 404 from their own upstream ("Upstream fetch failed") across every title
// tried, movies work fine - looks like a live gap on their end, not something wrong with this scraper
object SoapGoProvider : Provider {

    override val name = "SoapGo"
    override val baseUrl = "https://soapgo.to"
    override val logo = "$baseUrl/favicon.png"
    override val language = "en"
    private const val TAG = "SoapGoProvider"

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private interface Service {
        @retrofit2.http.Headers(USER_AGENT)
        @GET
        suspend fun getPage(@Url url: String): Document

        @retrofit2.http.Headers(USER_AGENT)
        @GET("movies")
        suspend fun getMovies(@Query("page") page: Int, @Query("sort") sort: String? = null): Document

        @retrofit2.http.Headers(USER_AGENT)
        @GET("tv")
        suspend fun getTvShows(@Query("page") page: Int, @Query("sort") sort: String? = null): Document

        @retrofit2.http.Headers(USER_AGENT)
        @GET("search/{query}")
        suspend fun search(@Path("query") query: String, @Query("page") page: Int): Document
    }

    private val service = Retrofit.Builder()
        .baseUrl("$baseUrl/")
        .addConverterFactory(JsoupConverterFactory.create())
        .client(
            OkHttpClient.Builder()
                .readTimeout(30, TimeUnit.SECONDS)
                .connectTimeout(30, TimeUnit.SECONDS)
                .dns(DnsResolver.doh)
                .build()
        )
        .build()
        .create(Service::class.java)

    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .dns(DnsResolver.doh)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class ResolveVideo(
        val type: String = "mp4",
        val url: String = "",
        @SerialName("Definition") val definition: String? = null,
    )

    @Serializable
    private data class ResolveResponse(val code: Int? = null, val video: List<ResolveVideo> = emptyList())

    private fun parseCard(el: Element): Show? {
        // home/search use h4.poster-title, the /movies and /tv archives use h2 for the same class
        val a = el.selectFirst("h2.poster-title a[href], h4.poster-title a[href]") ?: return null
        val href = a.attr("href").takeIf { it.isNotBlank() } ?: return null
        val title = a.text().trim().ifBlank { return null }
        val poster = el.selectFirst("img")?.let { it.attr("src").ifBlank { it.attr("data-src") } }?.ifBlank { null }
        val released = el.selectFirst(".media-release-value")?.text()?.trim()?.take(4)

        return if (href.startsWith("/tv/")) {
            TvShow(id = href, title = title, poster = poster, released = released)
        } else {
            Movie(id = href, title = title, poster = poster, released = released)
        }
    }

    private fun parseListing(doc: Document): List<Show> =
        doc.select("div.thumbnail").mapNotNull(::parseCard).distinctBy { it.id }

    // the site's own home is just "most popular"/"latest" repeated for movies then tv - reuse the
    // same sort-based pseudo-genres for 2 rows here so the page isnt just a hero banner waiting on
    // CUSTOM_HOME_SECTIONS to lazy-load, the rest of the sort combos live there instead
    override suspend fun getHome(): List<Category> = coroutineScope {
        val moviesDeferred = async { parseListing(service.getMovies(1, "hot")) }
        val tvDeferred = async { parseListing(service.getTvShows(1, "hot")) }
        listOfNotNull(
            moviesDeferred.await().takeIf { it.isNotEmpty() }?.let { Category(name = "Popular Movies", list = it) },
            tvDeferred.await().takeIf { it.isNotEmpty() }?.let { Category(name = "Popular TV Shows", list = it) },
        )
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) return emptyList()
        return parseListing(service.search(URLEncoder.encode(query, "UTF-8"), page))
    }

    override suspend fun getMovies(page: Int): List<Movie> =
        parseListing(service.getMovies(page)).filterIsInstance<Movie>()

    override suspend fun getTvShows(page: Int): List<TvShow> =
        parseListing(service.getTvShows(page)).filterIsInstance<TvShow>()

    private fun parseMetaValue(doc: Document, label: String): String? =
        doc.selectFirst("h2.h4:matchesOwn(^$label$)")?.nextElementSibling()?.text()?.trim()?.takeIf { it.isNotBlank() }

    // Rating's heading is followed by two <p>s (an "from IMDb" link, then "X.X from TMDb") - the
    // numeric one is never first, so this can't reuse parseMetaValue's next-sibling shortcut
    private fun parseRating(doc: Document): Double? {
        val container = doc.selectFirst("h2.h4:matchesOwn(^Rating$)")?.parent() ?: return null
        return container.select("p").firstNotNullOfOrNull { p ->
            Regex("""(\d+\.\d+)\s*from""").find(p.text())?.groupValues?.getOrNull(1)?.toDoubleOrNull()
        }
    }

    override suspend fun getMovie(id: String): Movie {
        val doc = service.getPage(id)
        val title = doc.selectFirst("h1")?.text()?.trim().orEmpty()

        return Movie(
            id = id,
            title = title,
            overview = doc.selectFirst("p#wrap")?.text()?.trim(),
            released = parseMetaValue(doc, "Release"),
            rating = parseRating(doc),
            poster = doc.selectFirst("img[alt$=poster]")?.attr("src"),
            imdbId = doc.selectFirst("a[href*='imdb.com/title/']")?.attr("href")?.substringAfter("title/")?.substringBefore("/")?.substringBefore("?"),
            genres = doc.select("h2.h4:matchesOwn(^Genre$)").firstOrNull()?.nextElementSibling()?.select("a")
                ?.map { Genre(id = it.text().trim(), name = it.text().trim()) }.orEmpty(),
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val doc = service.getPage(id)
        val title = doc.selectFirst("h1")?.text()?.trim().orEmpty()

        val seasons = doc.select("div.legacy-season-list > div.alert").mapNotNull { panel ->
            val headingText = panel.selectFirst(".season-heading h4")?.text().orEmpty()
            val num = Regex("""Season\s+(\d+)""").find(headingText)?.groupValues?.getOrNull(1)?.toIntOrNull()
                ?: return@mapNotNull null
            Season(id = "$id#s$num", number = num, title = "Season $num")
        }.distinctBy { it.number }.sortedBy { it.number }

        return TvShow(
            id = id,
            title = title,
            overview = doc.selectFirst("p#wrap")?.text()?.trim(),
            released = parseMetaValue(doc, "Release"),
            rating = parseRating(doc),
            poster = doc.selectFirst("img[alt$=poster]")?.attr("src"),
            imdbId = doc.selectFirst("a[href*='imdb.com/title/']")?.attr("href")?.substringAfter("title/")?.substringBefore("/")?.substringBefore("?"),
            genres = doc.select("h2.h4:matchesOwn(^Genre$)").firstOrNull()?.nextElementSibling()?.select("a")
                ?.map { Genre(id = it.text().trim(), name = it.text().trim()) }.orEmpty(),
            seasons = seasons,
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val showId = seasonId.substringBefore("#s")
        val seasonNumber = seasonId.substringAfter("#s").toIntOrNull() ?: return emptyList()

        val doc = service.getPage(showId)
        val panel = doc.select("div.legacy-season-list > div.alert").firstOrNull { p ->
            val headingText = p.selectFirst(".season-heading h4")?.text().orEmpty()
            Regex("""Season\s+$seasonNumber\b""").containsMatchIn(headingText)
        } ?: return emptyList()

        return panel.select(".episode-grid a[data-episode-id]").mapNotNull { a ->
            val href = a.attr("href").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val text = a.text().trim()
            val number = text.substringBefore(".").trim().toIntOrNull() ?: return@mapNotNull null
            val epTitle = text.substringAfter(".", "").trim().ifBlank { null }
            Episode(id = href, number = number, title = epTitle)
        }
    }

    // real genre browsing lives at /genre/{id}, id is an opaque token off the site's own filter
    // menu (not slug-able, has to be copied straight from there), mixes movies and tv together
    override suspend fun getGenre(id: String, page: Int): Genre {
        val url = "/genre/$id" + if (page > 1) "?page=$page" else ""
        val items = parseListing(service.getPage(url))
        return Genre(id = id, name = id, shows = items)
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("People are not available on SoapGo.")
    }

    private suspend fun getResolveJson(path: String): ResolveResponse? {
        return try {
            val body = withContext(Dispatchers.IO) {
                client.newCall(
                    Request.Builder().url("$baseUrl$path")
                        .header("User-Agent", USER_AGENT.substringAfter(": "))
                        .header("Accept", "application/json")
                        .build()
                ).execute().use { it.body?.string() }
            } ?: return null
            json.decodeFromString<ResolveResponse>(body)
        } catch (e: Exception) {
            Log.e(TAG, "getResolveJson error for $path: ${e.message}", e)
            null
        }
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val doc = service.getPage(id)
        val iframeSrc = doc.selectFirst("#player iframe")?.attr("src") ?: return emptyList()

        val embedHtml = service.getPage(iframeSrc).html()
        val endpoint = Regex(""""endpoint"\s*:\s*"([^"]+)"""").find(embedHtml)?.groupValues?.get(1) ?: return emptyList()

        val sources = getResolveJson(endpoint)?.video ?: return emptyList()
        return sources.mapIndexedNotNull { index, v ->
            if (v.url.isBlank()) return@mapIndexedNotNull null
            Video.Server(id = v.url, name = v.definition ?: "Server ${index + 1}", src = v.url)
        }
    }

    override suspend fun getVideo(server: Video.Server): Video = Video(
        source = server.src,
        type = if (server.src.contains(".m3u8")) MimeTypes.APPLICATION_M3U8 else MimeTypes.VIDEO_MP4,
    )
}
