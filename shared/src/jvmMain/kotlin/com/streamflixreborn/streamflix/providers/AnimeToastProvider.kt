package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.ListItem
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.Show
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object AnimeToastProvider : Provider {

    override val baseUrl = "https://www.animetoast.cc"
    override val name = "AnimeToast"
    override val logo = "$baseUrl/wp-content/uploads/2018/03/toastfavi-72x72.png"
    override val language = "de"

    private val GENRES = listOf(
        "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Ecchi",
        "Harem", "Horror", "Mecha", "Shounen", "Seinen", "Supernatural", "Slice-of-Life",
    )

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private val service = Service.build()

    private interface Service {
        companion object {
            fun build(): Service {
                val client = OkHttpClient.Builder()
                    .dns(DnsResolver.doh)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .build()

                return Retrofit.Builder()
                    .baseUrl("https://www.animetoast.cc")
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(Service::class.java)
            }
        }

        @Headers(USER_AGENT)
        @GET
        suspend fun getPage(@Url url: String): Document
    }

    // same .item-thumbnail/.item-head card markup on the home page, category/tag listings and search results
    private fun parseCard(el: Element): TvShow? {
        val a = el.selectFirst(".item-thumbnail a[href]") ?: return null
        val id = a.attr("href").trimEnd('/').substringAfterLast("/").takeIf { it.isNotBlank() } ?: return null
        val poster = el.selectFirst(".item-thumbnail img")?.let { it.attr("src").takeIf { s -> s.isNotBlank() } ?: it.attr("data-src") }
        val title = el.selectFirst(".item-head h3 a")?.text()?.trim() ?: return null

        return TvShow(id = id, title = title, poster = poster)
    }

    private fun parseListing(document: Document): List<TvShow> =
        document.select("div.video-item").mapNotNull { parseCard(it) }.distinctBy { it.id }

    override suspend fun getHome(): List<Category> {
        val doc = service.getPage("$baseUrl/")
        val categories = mutableListOf<Category>()

        doc.select("div.smart-box").forEach { box ->
            val name = box.selectFirst(".smart-box-head h2")?.text()?.trim() ?: return@forEach
            val items = box.select("div.video-item").mapNotNull { parseCard(it) }
            if (items.isNotEmpty()) categories.add(Category(name = name, list = items))
        }

        return categories
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return GENRES.map { Genre(id = it.lowercase(), name = it) }
        }
        if (page > 1) return emptyList()

        val doc = service.getPage("$baseUrl/?s=${URLEncoder.encode(query, "UTF-8")}")
        return parseListing(doc)
    }

    override suspend fun getMovies(page: Int): List<Movie> = emptyList()

    override suspend fun getTvShows(page: Int): List<TvShow> = withContext(Dispatchers.IO) {
        val sub = async { fetchListing("category/ger-sub/serie-ger-sub/page/$page/") }
        val dub = async { fetchListing("category/ger-dub/serie/page/$page/") }
        (sub.await() + dub.await()).distinctBy { it.id }
    }

    private suspend fun fetchListing(path: String): List<TvShow> {
        return try {
            parseListing(service.getPage("$baseUrl/$path"))
        } catch (e: HttpException) {
            if (e.code() == 404) emptyList() else throw e
        }
    }

    override suspend fun getMovie(id: String): Movie = throw Exception("Movies not supported")

    override suspend fun getTvShow(id: String): TvShow {
        val doc = service.getPage("$baseUrl/$id/")

        val title = doc.selectFirst("meta[property=og:title]")?.attr("content")?.trim() ?: id
        val poster = doc.select("meta[property=og:image]").firstOrNull()?.attr("content")
        // two og:description tags on this template, the yoast one further down has the real synopsis
        val overview = doc.select("meta[property=og:description]").map { it.attr("content") }
            .firstOrNull { it.isNotBlank() }?.substringBefore(" Genre:")?.trim()
        val genres = doc.select(".item-tax-list div:has(strong:matchesOwn(^Tags:)) a[href*=/tag/]").map {
            Genre(id = it.attr("href").trimEnd('/').substringAfterLast("/"), name = it.text().trim())
        }

        return TvShow(
            id = id,
            title = title,
            overview = overview,
            poster = poster,
            banner = poster,
            genres = genres,
            seasons = listOf(Season(id = id, number = 1, title = "Episodes")),
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val doc = service.getPage("$baseUrl/$seasonId/")
        val count = doc.select("div.tab-pane").maxOfOrNull { it.select("a.multilink-btn").size } ?: 0
        return (1..count).map { n -> Episode(id = "${seasonId}_$n", number = n) }
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        val doc = try {
            service.getPage("$baseUrl/tag/$id/page/$page/")
        } catch (e: HttpException) {
            if (e.code() == 404) return Genre(id, id) else throw e
        }
        return Genre(id = id, name = id, shows = parseListing(doc).filterIsInstance<Show>())
    }

    override suspend fun getPeople(id: String, page: Int): People = People(id = id, name = id)

    // every embed host is its own tab (Voe/FMoon/VidM/Mp4Upload/...), each tab lists one ?link=N
    // per episode in order, numbered sequentially across all tabs combined rather than per-episode
    private fun extractEmbed(doc: Document): String? {
        val el = doc.selectFirst("#player-embed a[href], #player-embed iframe[src]") ?: return null
        val src = if (el.tagName() == "a") el.attr("href") else el.attr("src")
        return src.takeIf { it.isNotBlank() }
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val (showId, episodeNumber) = when (videoType) {
            is Video.Type.Movie -> id to 1
            is Video.Type.Episode -> id.substringBeforeLast("_") to (id.substringAfterLast("_").toIntOrNull() ?: 1)
        }

        val doc = service.getPage("$baseUrl/$showId/")
        val tabs = doc.select("ul.nav-tabs a[href^=#multi_link_tab]").mapNotNull { a ->
            val tabId = a.attr("href").removePrefix("#").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val label = a.text().trim().ifBlank { tabId }
            val pane = doc.selectFirst("#$tabId") ?: return@mapNotNull null
            val linkValue = pane.select("a.multilink-btn").getOrNull(episodeNumber - 1)
                ?.attr("href")?.substringAfter("?link=")?.toIntOrNull() ?: return@mapNotNull null
            label to linkValue
        }

        return coroutineScope {
            tabs.map { (label, linkValue) ->
                async {
                    runCatching {
                        var src = extractEmbed(service.getPage("$baseUrl/$showId/?link=$linkValue"))
                            ?: return@runCatching null
                        // some posts point at a duplicate internal post instead of the real embed, follow it once more
                        if (src.startsWith(baseUrl)) {
                            src = extractEmbed(service.getPage(src)) ?: return@runCatching null
                        }
                        Video.Server(id = "link$linkValue", name = label, src = src)
                    }.getOrNull()
                }
            }.awaitAll().filterNotNull()
        }
    }

    override suspend fun getVideo(server: Video.Server): Video = Extractor.extract(server.src, server)
}
