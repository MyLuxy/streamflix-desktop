package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.ListItem
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.TmdbUtils
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object CineStreamProvider : Provider {

    override val baseUrl = "https://cinestream.info"
    override val name = "CineStream"
    override val logo = "$baseUrl/favicon.ico"
    override val language = "fr"

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    // site chokes and every request balloons to 30-70s if we hit it with all servers at once like the app's racing does
    private fun throttledDispatcher() = Dispatcher().apply { maxRequestsPerHost = 2 }

    private interface CineStreamService {
        companion object {
            fun build(): CineStreamService {
                val client = OkHttpClient.Builder()
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .dns(DnsResolver.doh)
                    .dispatcher(throttledDispatcher())
                    .build()

                return Retrofit.Builder()
                    .baseUrl("https://cinestream.info")
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(CineStreamService::class.java)
            }
        }

        @Headers(USER_AGENT)
        @GET(".")
        suspend fun getHome(): Document

        @Headers(USER_AGENT)
        @GET
        suspend fun getPage(@Url url: String): Document
    }

    private val service = CineStreamService.build()

    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .dns(DnsResolver.doh)
        .dispatcher(throttledDispatcher())
        .build()

    // the player endpoint checks the referer against the film page it was requested from
    private fun getWithReferer(url: String, referer: String): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT.substringAfter(": "))
            .header("Referer", referer)
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code} for $url")
            return response.body?.string().orEmpty()
        }
    }

    private fun slugOf(url: String): String = url.trim().trimEnd('/').substringAfterLast('/')

    private fun parseCard(el: Element): Movie? {
        val a = el.selectFirst("a[href^=/film/]") ?: return null
        val id = slugOf(a.attr("href")).takeIf { it.isNotBlank() } ?: return null
        val poster = a.selectFirst("img")?.attr("src")?.takeIf { it.isNotBlank() }
        val title = a.selectFirst("span.text-lg")?.text()?.trim()
            ?: a.selectFirst("img")?.attr("alt")?.trim().orEmpty()
        if (title.isBlank()) return null
        return Movie(id = id, title = title, poster = poster)
    }

    private fun parseListing(root: Element): List<Movie> =
        root.select("article.swiper-slide, div.cat-item").mapNotNull { parseCard(it) }.distinctBy { it.id }

    // next.js streams the player widget's data as an escaped json blob mid-page; unescaping once
    // turns it (and everything else on the page) into plain json/text, cheaper than a real rsc parser
    private data class PlayerData(val tmdbId: Int, val servers: List<String>)

    private fun extractPlayerData(html: String): PlayerData? {
        val normalized = html.replace("\\\"", "\"")
        val match = Regex(""""players":(\[.*?])(?:,"title":"[^"]*")?,"duree":"[^"]*","img":"[^"]*","tmdbid":(\d+)""")
            .find(normalized) ?: return null
        val servers = Regex(""""name":"([^"]*)"""").findAll(match.groupValues[1]).map { it.groupValues[1] }.toList()
        if (servers.isEmpty()) return null
        return PlayerData(tmdbId = match.groupValues[2].toIntOrNull() ?: return null, servers = servers)
    }

    private fun extractGenres(html: String): List<Genre> {
        val normalized = html.replace("\\\"", "\"")
        return Regex(""""href":"/films/([^"/]+)/\d+"""").findAll(normalized)
            .map { it.groupValues[1] }
            .distinct()
            .map { Genre(id = it, name = it) }
            .toList()
    }

    private val HOME_GENRES = listOf("Action", "Comédie", "Drame", "Thriller", "Horreur", "Animation", "Aventure", "Science-Fiction")

    override suspend fun getHome(): List<Category> {
        val doc = service.getHome()
        val categories = mutableListOf<Category>()

        doc.select("h2").forEach { heading ->
            val name = heading.text().trim().takeIf { it.isNotBlank() } ?: return@forEach
            val grid = heading.nextElementSibling() ?: return@forEach
            val items = parseListing(grid)
            if (items.isNotEmpty()) categories.add(Category(name = name, list = items))
        }

        return categories
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return HOME_GENRES.map { Genre(id = it, name = it) }
        }
        if (page > 1) return emptyList()

        val doc = service.getPage("$baseUrl/search?q=${URLEncoder.encode(query, "UTF-8")}")
        return parseListing(doc)
    }

    override suspend fun getMovies(page: Int): List<Movie> =
        parseListing(service.getPage("$baseUrl/films-populaires/$page"))

    override suspend fun getTvShows(page: Int): List<TvShow> = emptyList()

    override suspend fun getMovie(id: String): Movie {
        val doc = service.getPage("$baseUrl/film/$id")
        val html = doc.html()
        val player = extractPlayerData(html)
        val genres = extractGenres(html)

        val tmdbMovie = player?.let { runCatching { TmdbUtils.getMovieById(it.tmdbId, language = "fr") }.getOrNull() }
        val fallbackTitle = doc.selectFirst("meta[property=og:title]")?.attr("content")
            ?.substringAfter("Film ")?.substringBefore(" en Streaming")?.trim().orEmpty()
        val fallbackPoster = doc.selectFirst("meta[property=og:image]")?.attr("content")

        return Movie(
            id = id,
            title = tmdbMovie?.title ?: fallbackTitle,
            overview = tmdbMovie?.overview,
            poster = tmdbMovie?.poster ?: fallbackPoster,
            banner = tmdbMovie?.banner,
            rating = tmdbMovie?.rating,
            released = tmdbMovie?.released,
            runtime = tmdbMovie?.runtime,
            genres = tmdbMovie?.genres ?: genres,
            cast = tmdbMovie?.cast ?: emptyList(),
            imdbId = tmdbMovie?.imdbId,
        )
    }

    override suspend fun getTvShow(id: String): TvShow = throw Exception("TV shows not supported")

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> = emptyList()

    override suspend fun getGenre(id: String, page: Int): Genre {
        val shows = runCatching { parseListing(service.getPage("$baseUrl/films/$id/$page")) }.getOrDefault(emptyList())
        return Genre(id = id, name = id, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People = throw Exception("People not supported")

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val doc = service.getPage("$baseUrl/film/$id")
        val player = extractPlayerData(doc.html()) ?: return emptyList()

        return player.servers.mapIndexed { index, serverName ->
            Video.Server(id = "${player.tmdbId}|$index|$id", name = serverName)
        }
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val (tmdbId, index, slug) = server.id.split("|", limit = 3)
        val html = getWithReferer("$baseUrl/player/$tmdbId/$index", "$baseUrl/film/$slug")
        val embedUrl = Regex("""<iframe[^>]*\ssrc="([^"]+)"""").find(html)?.groupValues?.get(1)
            ?: throw Exception("No embed found")

        return Extractor.extract(embedUrl, server)
    }
}
