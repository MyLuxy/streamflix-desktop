package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.json.JSONObject
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.Url
import java.util.concurrent.TimeUnit

// movie-only (nav is just home/movies/popular). the watch button doesn't link anywhere - each
// "provider chip" carries a laravel-encrypted `data-p` blob we don't need to decrypt: it's just
// relayed as-is to POST /n (with the page's csrf token + session cookies), which hands back a
// one-time token; GET /n/{token} 302s to the real embed (voe, etc) for Extractor to take over
object FilmoProvider : Provider {

    override val name = "Filmo"
    override val baseUrl = "https://filmo.to"
    override val language = "de"
    override val logo = "$baseUrl/favicon-96x96.png"

    // shared so the session cookie set while fetching the movie page is still present for the
    // POST /n call right after - a fresh cookieless client gets a csrf mismatch on that request
    private val cookieJar = object : CookieJar {
        private val store = HashMap<String, List<Cookie>>()
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) { store[url.host] = cookies }
        override fun loadForRequest(url: HttpUrl): List<Cookie> = store[url.host] ?: emptyList()
    }

    private fun clientBuilder() = OkHttpClient.Builder()
        .dns(DnsResolver.doh)
        .cookieJar(cookieJar)
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .build()
            )
        }

    // page fetches need normal redirect-following; the /n resolve calls specifically need the
    // raw 302 Location header instead of the client silently following it, so that's a second,
    // otherwise-identical client (same cookie jar, so the session/csrf pairing still lines up)
    private val client = clientBuilder().build()
    private val noRedirectClient = clientBuilder().followRedirects(false).build()

    private val service = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(JsoupConverterFactory.create())
        .build()
        .create(Service::class.java)

    private interface Service {
        @GET
        suspend fun getPage(@Url url: String): Document

        @GET("search")
        suspend fun search(@Query("q") q: String, @Query("page") page: Int): Document
    }

    private fun parseCard(a: Element): Movie? {
        val href = a.attr("href").ifBlank { return null }
        val title = a.selectFirst(".swiper-card-title, .movie-poster-grid-card__title, .popular-spotlight-card__title")
            ?.text()?.trim()
            ?.ifEmpty { null }
            ?: a.selectFirst("img")?.attr("alt")?.trim()?.ifEmpty { null }
            ?: return null
        val poster = a.selectFirst("img")?.attr("src")
        return Movie(id = href, title = title, poster = poster)
    }

    override suspend fun getHome(): List<Category> {
        val document = service.getPage(baseUrl)

        return document.select("h3").mapNotNull { heading ->
            val name = heading.ownText().trim().ifEmpty { return@mapNotNull null }
            // the heading and its "video-card" swiper are both direct children of the same
            // "video-row" section, not nested inside one another - closest() finds that shared
            // ancestor directly instead of guessing how many levels to walk up
            val section = heading.closest("div.video-row") ?: return@mapNotNull null
            val items = section.select("a.video-card").mapNotNull { parseCard(it) }.distinctBy { it.id }
            if (items.isEmpty()) null else Category(name = name, list = items)
            // the page renders a duplicate (mobile-layout) h3 for every section with identical
            // text, each still resolving to the same video-row - collapse those back to one
        }.distinctBy { it.name }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            val document = service.getPage(baseUrl)
            return document.select("a[href*='/genres/']").mapNotNull {
                val href = it.attr("href")
                val id = href.trimEnd('/').substringAfterLast("/genres/").ifBlank { return@mapNotNull null }
                Genre(id = id, name = it.text().trim())
            }.distinctBy { it.id }
        }

        val document = service.search(query, page)
        // search results use a different card template ("spotlight card") than every other
        // listing page on the site, for reasons known only to filmo's own frontend
        return document.select("a.movie-poster-grid-card, a.popular-spotlight-card__link")
            .mapNotNull { parseCard(it) }
            .distinctBy { it.id }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val url = if (page <= 1) "$baseUrl/movies" else "$baseUrl/movies?page=$page"
        val document = service.getPage(url)
        return document.select("a.movie-poster-grid-card").mapNotNull { parseCard(it) }
    }

    override suspend fun getTvShows(page: Int): List<TvShow> = emptyList()

    override suspend fun getMovie(id: String): Movie {
        val document = service.getPage(id)
        val metaText = document.selectFirst(".text-secondary .small")?.text().orEmpty()

        return Movie(
            id = id,
            title = document.selectFirst("h1")?.text()?.trim().orEmpty(),
            overview = document.selectFirst(".movie-detail-synopsis")?.text()?.trim(),
            released = Regex("""(19|20)\d{2}""").find(metaText)?.value,
            runtime = Regex("""(\d+)\s*h\s*(\d+)?\s*min""").find(metaText)?.let {
                val h = it.groupValues[1].toIntOrNull() ?: 0
                val m = it.groupValues.getOrNull(2)?.toIntOrNull() ?: 0
                h * 60 + m
            },
            rating = Regex("""IMDb\s+([\d.]+)""").find(metaText)?.groupValues?.getOrNull(1)?.toDoubleOrNull(),
            poster = document.selectFirst("img.hero-background-image")?.attr("src"),
            banner = document.selectFirst("img.hero-background-image")?.attr("src"),
            genres = document.select("a[href*='/genres/']").map {
                Genre(id = it.attr("href").trimEnd('/').substringAfterLast("/genres/"), name = it.text().trim())
            }.distinctBy { it.id },
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        throw Exception("Filmo does not support TV shows")
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> = emptyList()

    override suspend fun getGenre(id: String, page: Int): Genre {
        val url = if (page <= 1) "$baseUrl/genres/$id" else "$baseUrl/genres/$id?page=$page"
        val document = service.getPage(url)
        return Genre(
            id = id,
            name = document.selectFirst("h1")?.text()?.trim() ?: id,
            shows = document.select("a.movie-poster-grid-card").mapNotNull { parseCard(it) },
        )
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("People pages are not supported by Filmo")
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val document = service.getPage(id)
        val csrf = document.selectFirst("meta[name=csrf-token]")?.attr("content")
            ?: throw Exception("Filmo csrf token not found")

        return document.select("[data-provider-chip]").mapNotNull { chip ->
            val dataP = chip.attr("data-p").ifBlank { return@mapNotNull null }
            val serverName = chip.attr("aria-label").ifBlank { "Server" }
            Video.Server(id = "$dataP::$csrf::$id", name = serverName)
        }.distinctBy { it.name }
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val parts = server.id.split("::")
        if (parts.size != 3) throw Exception("Filmo malformed server id")
        val (dataP, csrf, refererUrl) = parts

        val body = JSONObject().put("p", dataP).toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$baseUrl/n")
            .header("Accept", "application/json")
            .header("X-CSRF-TOKEN", csrf)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", refererUrl)
            .post(body)
            .build()

        val token = client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("Filmo /n request failed: ${response.code}")
            JSONObject(response.body?.string().orEmpty()).optString("x").ifBlank { null }
        } ?: throw Exception("Filmo token not found")

        val embedUrl = noRedirectClient.newCall(
            Request.Builder()
                .url("$baseUrl/n/$token")
                .header("Referer", refererUrl)
                .build()
        ).execute().use { response ->
            response.header("Location") ?: throw Exception("Filmo embed redirect not found")
        }

        return Extractor.extract(embedUrl, server)
    }
}
