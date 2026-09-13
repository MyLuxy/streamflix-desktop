package com.streamflixreborn.streamflix.providers

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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object AnimoTvSlashProvider : Provider {

    override val baseUrl = "https://animotvslash.org"
    override val name = "AnimoTVSlash"
    override val logo = "$baseUrl/wp-content/uploads/2026/05/logo_capital_transparent_preview.png"
    override val language = "en"

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private interface AnimoTvSlashService {
        companion object {
            fun build(): AnimoTvSlashService {
                val client = OkHttpClient.Builder()
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .dns(DnsResolver.doh)
                    .build()

                return Retrofit.Builder()
                    .baseUrl("https://animotvslash.org")
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(AnimoTvSlashService::class.java)
            }
        }

        @Headers(USER_AGENT)
        @GET(".")
        suspend fun getHome(): Document

        @Headers(USER_AGENT)
        @GET
        suspend fun getPage(@Url url: String): Document
    }

    private val service = AnimoTvSlashService.build()

    // the theme's own list, scraped once off the nav menu rather than hardcoded from memory
    private val ALL_GENRES = listOf(
        "action", "adult-cast", "adventure", "comedy", "drama", "ecchi", "fantasy", "gore",
        "historical", "martial-arts", "parody", "psychological", "romance", "school", "seinen",
        "shounen", "super-power", "supernatural",
    )

    private fun slugOf(url: String): String = url.trim().trimEnd('/').substringAfterLast('/')

    // home widgets link straight to an episode, the show's own slug has to be pulled back out of it
    private fun showSlugFromEpisodeSlug(episodeSlug: String): String =
        episodeSlug.replace(Regex("-episode-\\d+.*$"), "")

    private fun parseCard(el: Element): Show? {
        val a = el.selectFirst("div.bsx > a") ?: return null
        val href = a.attr("href")
        if (href.isBlank()) return null
        val img = a.selectFirst("img")
        val poster = img?.attr("src")?.takeIf { it.isNotBlank() }
        val isMovie = a.selectFirst("div.typez")?.text()?.trim()?.equals("Movie", ignoreCase = true) == true

        val slug = if (href.contains("/anime/")) slugOf(href) else showSlugFromEpisodeSlug(slugOf(href))
        // .tt holds the clean show title as a bare text node, right before a nested h2 with "... Episode N"
        val title = a.selectFirst("div.tt")?.ownText()?.trim()?.takeIf { it.isNotBlank() }
            ?: a.attr("title").trim()
        if (title.isBlank() || slug.isBlank()) return null

        return if (isMovie) {
            Movie(id = slug, title = title, poster = poster)
        } else {
            TvShow(id = slug, title = title, poster = poster)
        }
    }

    // these widgets only ever carry a handful of items, too few to fill a scrollable row
    private val SKIPPED_HOME_SECTIONS = setOf("Ongoing Anime", "Latest Movies", "Latest Completed", "Upcoming Anime")

    override suspend fun getHome(): List<Category> {
        val doc = service.getHome()
        val categories = mutableListOf<Category>()

        doc.select("div.bixbox").forEach { box ->
            val heading = box.selectFirst("h2, h3")?.text()?.trim()?.takeIf { it.isNotBlank() } ?: return@forEach
            if (heading in SKIPPED_HOME_SECTIONS) return@forEach
            val items = box.select("div.listupd article.bs").mapNotNull { parseCard(it) }.distinctBy { it.id }
            if (items.isNotEmpty()) categories.add(Category(name = heading, list = items))
        }

        return categories
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return ALL_GENRES.map { Genre(id = it, name = it.split('-').joinToString(" ") { w -> w.replaceFirstChar(Char::uppercase) }) }
        }
        if (page > 1) return emptyList()

        val doc = service.getPage("$baseUrl/?s=${URLEncoder.encode(query, "UTF-8")}")
        val tokens = query.lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }
        return doc.select("div.listupd article.bs").mapNotNull { parseCard(it) }
            .filter { item -> val t = item.title.lowercase(); tokens.all { t.contains(it) } }
            .distinctBy { it.id }
    }

    private suspend fun browse(type: String, page: Int): List<ListItem> {
        val path = if (page > 1) "anime/page/$page/" else "anime/"
        val doc = service.getPage("$baseUrl/$path?type=$type&order=update")
        return doc.select("div.listupd article.bs").mapNotNull { parseCard(it) }.distinctBy { it.id }
    }

    override suspend fun getMovies(page: Int): List<Movie> = browse("movie", page).filterIsInstance<Movie>()

    override suspend fun getTvShows(page: Int): List<TvShow> = browse("tv", page).filterIsInstance<TvShow>()

    private fun parseGenres(doc: Document): List<Genre> =
        doc.select("div.genxed a").mapNotNull { a ->
            val href = a.attr("href").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val label = a.text().trim().takeIf { it.isNotBlank() } ?: return@mapNotNull null
            Genre(id = slugOf(href), name = label)
        }

    private fun parseYear(infoText: String): String? =
        Regex("Released:\\s*(\\d{4})").find(infoText)?.groupValues?.get(1)

    private fun parseOverview(doc: Document): String? =
        doc.selectFirst("div.ts-syn-full p")?.text()?.trim()?.takeIf { it.isNotBlank() }
            ?: doc.selectFirst("div.ts-syn-body")?.text()?.trim()?.takeIf { it.isNotBlank() }

    // a handful of specials (camrips, movie cuts) don't follow the "{show}-episode-{n}" url pattern
    // at all, so the real slug is captured here rather than guessed later from the episode number
    private fun parseEpisodes(doc: Document, showSlug: String): List<Episode> =
        doc.select("#ts-ep-list li a, div.eplister li a").mapNotNull { a ->
            val number = a.selectFirst("div.epl-num")?.text()?.trim()?.toIntOrNull() ?: return@mapNotNull null
            val episodeSlug = slugOf(a.attr("href")).takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val title = a.selectFirst("div.epl-title")?.text()?.trim()?.takeIf { it.isNotBlank() } ?: "Episode $number"
            Episode(id = "$showSlug#$episodeSlug", number = number, title = title)
        }.distinctBy { it.number }.sortedBy { it.number }

    override suspend fun getMovie(id: String): Movie {
        val doc = service.getPage("$baseUrl/anime/$id/")
        val title = doc.selectFirst("h1.entry-title")?.text()?.trim() ?: ""
        val poster = doc.selectFirst("div.thumb img")?.attr("src")?.takeIf { it.isNotBlank() }
        val infoText = doc.selectFirst("div.info-content")?.text().orEmpty()

        return Movie(
            id = id,
            title = title,
            poster = poster,
            overview = parseOverview(doc),
            released = parseYear(infoText),
            genres = parseGenres(doc),
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val doc = service.getPage("$baseUrl/anime/$id/")
        val title = doc.selectFirst("h1.entry-title")?.text()?.trim() ?: ""
        val poster = doc.selectFirst("div.thumb img")?.attr("src")?.takeIf { it.isNotBlank() }
        val infoText = doc.selectFirst("div.info-content")?.text().orEmpty()

        val episodes = parseEpisodes(doc, id)

        return TvShow(
            id = id,
            title = title,
            poster = poster,
            overview = parseOverview(doc),
            released = parseYear(infoText),
            genres = parseGenres(doc),
            seasons = if (episodes.isNotEmpty()) listOf(Season(id = id, number = 1, episodes = episodes)) else emptyList(),
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val doc = service.getPage("$baseUrl/anime/$seasonId/")
        return parseEpisodes(doc, seasonId)
    }

    private fun genrePagePath(id: String, sitePage: Int): String =
        if (sitePage > 1) "genres/$id/page/$sitePage/" else "genres/$id/"

    override suspend fun getGenre(id: String, page: Int): Genre {
        // the site only puts 10 cards per page, nowhere near enough to fill a scrollable home row,
        // so a single "page" here pulls a few real site pages at once and merges them
        val sitePages = if (page <= 1) listOf(1, 2, 3) else listOf(page + 2)
        val shows = coroutineScope {
            sitePages.map { sitePage ->
                async {
                    runCatching {
                        service.getPage("$baseUrl/${genrePagePath(id, sitePage)}")
                            .select("div.listupd article.bs").mapNotNull { parseCard(it) }
                    }.getOrDefault(emptyList())
                }
            }.awaitAll().flatten()
        }.distinctBy { it.id }
        return Genre(id = id, name = id, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People = throw Exception("People not supported")

    // the ld+json block always has one VideoObject contentUrl (the stream) plus an unrelated
    // Organization/logo one, filtering by the .m3u8 extension is the reliable way to tell them apart
    private fun extractContentUrl(doc: Document): String? =
        Regex("\"contentUrl\"\\s*:\\s*\"([^\"]+\\.m3u8[^\"]*)\"")
            .find(doc.html())?.groupValues?.get(1)?.replace("\\/", "/")

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        // a movie's own episode slug isn't always "{id}-episode-1" (some are "{id}-movie-episode-1"),
        // so it's read back off the show page's own episode list instead of guessed
        val watchSlug = when (videoType) {
            is Video.Type.Movie -> {
                val showDoc = service.getPage("$baseUrl/anime/$id/")
                parseEpisodes(showDoc, id).firstOrNull()?.id?.substringAfter('#') ?: return emptyList()
            }
            is Video.Type.Episode -> id.substringAfter('#')
        }
        val doc = service.getPage("$baseUrl/$watchSlug/")
        val url = extractContentUrl(doc) ?: return emptyList()
        return listOf(Video.Server(id = url, name = "AnimoTVSlash", src = url))
    }

    override suspend fun getVideo(server: Video.Server): Video {
        return Video(source = server.src, subtitles = emptyList())
    }
}
