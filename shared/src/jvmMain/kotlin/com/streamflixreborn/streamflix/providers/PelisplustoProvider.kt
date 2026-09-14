package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.Show
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object PelisplustoProvider : Provider {

    override val name = "Pelisplusto"
    override val baseUrl = "https://pelisplushd.to"
    override val language = "es"
    override val logo = "$baseUrl/images/logo/logo.png"

    private val GENRES = listOf(
        "accion" to "Acción", "animacion" to "Animación", "aventura" to "Aventura",
        "ciencia-ficcion" to "Ciencia Ficción", "comedia" to "Comedia", "crimen" to "Crimen",
        "documental" to "Documental", "drama" to "Drama", "fantasia" to "Fantasía",
        "guerra" to "Guerra", "historia" to "Historia", "misterio" to "Misterio",
        "romance" to "Romance", "suspense" to "Suspense", "terror" to "Terror", "western" to "Western",
    )

    private val SEASON_NUMBER_REGEX = Regex("""TEMPORADA\s+(\d+)""")

    private val client = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                .build()
            chain.proceed(request)
        }
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .dns(DnsResolver.doh)
        .build()

    private val service = Retrofit.Builder()
        .baseUrl("$baseUrl/")
        .addConverterFactory(JsoupConverterFactory.create())
        .client(client)
        .build()
        .create(PelisplustoService::class.java)

    private interface PelisplustoService {
        @GET
        suspend fun getPage(@Url url: String): Document
    }

    private fun getAbsoluteUrl(url: String?): String? {
        if (url.isNullOrEmpty()) return null
        return if (url.startsWith("http")) url else "$baseUrl$url"
    }

    private fun parseShows(document: Document): List<ListItem> {
        return document.select("a.Posters-link").mapNotNull {
            val url = it.attr("href")
            val poster = getAbsoluteUrl(it.selectFirst("img.Posters-img")?.attr("src"))
            val title = it.selectFirst(".listing-content p")?.text()?.trim() ?: return@mapNotNull null

            when {
                url.contains("/pelicula/") -> Movie(id = url.substringAfter("/pelicula/").removeSuffix("/"), title = title, poster = poster)
                url.contains("/serie/") -> TvShow(id = url.substringAfter("/serie/").removeSuffix("/"), title = title, poster = poster)
                url.contains("/anime/") -> TvShow(id = "anime/${url.substringAfter("/anime/").removeSuffix("/")}", title = title, poster = poster)
                else -> null
            }
        }
    }

    override suspend fun getHome(): List<Category> = coroutineScope {
        val moviesDeferred = async { runCatching { service.getPage("$baseUrl/peliculas") }.getOrNull() }
        val seriesDeferred = async { runCatching { service.getPage("$baseUrl/series") }.getOrNull() }
        val animesDeferred = async { runCatching { service.getPage("$baseUrl/animes") }.getOrNull() }

        listOfNotNull(
            moviesDeferred.await()?.let { parseShows(it).filterIsInstance<Movie>() }?.takeIf { it.isNotEmpty() }?.let { Category("Películas", it) },
            seriesDeferred.await()?.let { parseShows(it).filterIsInstance<TvShow>() }?.takeIf { it.isNotEmpty() }?.let { Category("Series", it) },
            animesDeferred.await()?.let { parseShows(it).filterIsInstance<TvShow>() }?.takeIf { it.isNotEmpty() }?.let { Category("Animes", it) },
        )
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return GENRES.map { (id, label) -> Genre("generos/$id", label) }
        }
        if (page > 1) return emptyList()

        val document = service.getPage("$baseUrl/search?s=${URLEncoder.encode(query, "UTF-8")}")
        return parseShows(document)
    }

    override suspend fun getMovies(page: Int): List<Movie> =
        parseShows(service.getPage("$baseUrl/peliculas?page=$page")).filterIsInstance<Movie>()

    override suspend fun getTvShows(page: Int): List<TvShow> =
        parseShows(service.getPage("$baseUrl/series?page=$page")).filterIsInstance<TvShow>()

    override suspend fun getGenre(id: String, page: Int): Genre {
        val document = service.getPage("$baseUrl/$id?page=$page")
        val shows = parseShows(document).filterIsInstance<Show>()
        val genreName = GENRES.find { "generos/${it.first}" == id }?.second ?: id.substringAfterLast("/")
        return Genre(id = id, name = genreName, shows = shows)
    }

    private data class DetailInfo(
        val title: String, val overview: String?, val poster: String?,
        val rating: Double?, val released: String?, val genres: List<Genre>,
    )

    // shared by getMovie/getTvShow, both use the same info block, just different detail page urls
    private fun parseDetail(document: Document): DetailInfo {
        val title = document.selectFirst("h1.m-b-5")?.text()?.trim() ?: ""
        val poster = getAbsoluteUrl(document.selectFirst("div.col-sm-3 img")?.attr("src"))
        val overview = document.selectFirst("p:has(b:matchesOwn(^Sinopsis)) + div.text-large")?.text()?.trim()
        val rating = document.selectFirst("span.ion-md-star")?.text()?.substringBefore("/")?.trim()?.toDoubleOrNull()
        val released = document.selectFirst("a[href*=/year/] span")?.text()?.trim()
        // the genre menu elsewhere on the page also links to /generos/, scope to the labeled block on this title
        val genres = document.select("div:has(small:matchesOwn(^Generos$)) > a[href*=/generos/]")
            .map { Genre(id = it.attr("href").removePrefix("/"), name = it.text().trim()) }
        return DetailInfo(title, overview, poster, rating, released, genres)
    }

    override suspend fun getMovie(id: String): Movie {
        val document = service.getPage("$baseUrl/pelicula/$id")
        val info = parseDetail(document)
        return Movie(
            id = id, title = info.title, overview = info.overview,
            poster = info.poster, banner = info.poster,
            rating = info.rating, released = info.released, genres = info.genres,
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val url = if (id.startsWith("anime/")) "$baseUrl/$id" else "$baseUrl/serie/$id"
        val document = service.getPage(url)
        val info = parseDetail(document)

        val seasons = document.select(".TbVideoNv .nav-link").mapNotNull { navLink ->
            val number = SEASON_NUMBER_REGEX.find(navLink.text().uppercase())?.groupValues?.get(1)?.toIntOrNull() ?: return@mapNotNull null
            Season(id = "$id/$number", number = number, title = "Temporada $number")
        }.sortedByDescending { it.number }

        return TvShow(
            id = id, title = info.title, overview = info.overview,
            poster = info.poster, banner = info.poster,
            rating = info.rating, released = info.released, genres = info.genres,
            seasons = seasons,
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val lastSlash = seasonId.lastIndexOf('/')
        if (lastSlash == -1) return emptyList()
        val showId = seasonId.substring(0, lastSlash)
        val seasonNumber = seasonId.substring(lastSlash + 1)

        val url = if (showId.startsWith("anime/")) "$baseUrl/$showId" else "$baseUrl/serie/$showId"
        val document = service.getPage(url)

        // season tabs and their episode lists are all on this one page, matched by the tab's #fragment id
        val navLink = document.select(".TbVideoNv .nav-link")
            .find { SEASON_NUMBER_REGEX.find(it.text().uppercase())?.groupValues?.get(1) == seasonNumber } ?: return emptyList()
        val paneId = navLink.attr("href").trim().removePrefix("#")
        val pane = document.selectFirst("#$paneId") ?: return emptyList()

        return pane.select("a[href*=/capitulo/]").mapNotNull { a ->
            val number = a.attr("href").substringAfterLast("/capitulo/").trim().toIntOrNull() ?: return@mapNotNull null
            Episode(id = "$seasonId/$number", number = number)
        }.sortedBy { it.number }
    }

    // voe mirrors sometimes gate behind an altcha challenge that falls back to a headless browser wait
    // with no real cancellation, can stall the whole race for minutes, not worth it with 2 other hosts around
    private fun isBlockedHost(url: String) = url.contains("voe.sx", ignoreCase = true)

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        return when (videoType) {
            is Video.Type.Movie -> {
                val document = service.getPage("$baseUrl/pelicula/${videoType.id}")
                // language variants (latino/subtitulado) are separate <li> entries, each with its own embed url right on it
                document.select("li.playurl").mapNotNull { li ->
                    val url = li.attr("data-url").takeIf { it.isNotBlank() && !isBlockedHost(it) } ?: return@mapNotNull null
                    val host = li.selectFirst("a")?.text()?.trim() ?: "Server"
                    val lang = li.attr("data-name").takeIf { it.isNotBlank() }
                    Video.Server(id = url, name = if (lang != null) "$host ($lang)" else host, src = url)
                }
            }
            is Video.Type.Episode -> {
                val showId = videoType.tvShow.id
                val basePath = if (showId.startsWith("anime/")) "$baseUrl/$showId" else "$baseUrl/serie/$showId"
                val document = service.getPage("$basePath/temporada/${videoType.season.number}/capitulo/${videoType.number}")

                // episode pages list servers as bare tabs, the actual embed urls live in a separate id->url lookup table
                val urlById = document.select("#link_url span[lid]").associate { it.attr("lid") to it.attr("url") }
                document.select("ul.TbVideoNv li[data-id]").mapNotNull { li ->
                    val url = urlById[li.attr("data-id")]?.takeIf { it.isNotBlank() && !isBlockedHost(it) } ?: return@mapNotNull null
                    val host = li.selectFirst("a")?.text()?.trim() ?: "Server"
                    Video.Server(id = url, name = host, src = url)
                }
            }
        }
    }

    override suspend fun getVideo(server: Video.Server): Video = Extractor.extract(server.src, server)

    override suspend fun getPeople(id: String, page: Int): People = throw Exception("Not yet implemented")
}
