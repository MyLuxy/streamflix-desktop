package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.extractors.MoviesapiExtractor
import com.streamflixreborn.streamflix.extractors.PrimeSrcExtractor
import com.streamflixreborn.streamflix.extractors.TwoEmbedExtractor
import com.streamflixreborn.streamflix.extractors.VidLinkExtractor
import com.streamflixreborn.streamflix.extractors.VidflixExtractor
import com.streamflixreborn.streamflix.extractors.VidrockExtractor
import com.streamflixreborn.streamflix.extractors.VidsrcNetExtractor
import com.streamflixreborn.streamflix.extractors.VidsrcRuExtractor
import com.streamflixreborn.streamflix.extractors.VidzeeExtractor
import com.streamflixreborn.streamflix.extractors.VixSrcExtractor
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
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object AnyMovieProvider : Provider {

    override val name = "AnyMovie"
    override val baseUrl = "https://anymovie.site"
    override val language = "en"
    override val logo = ""

    private val GENRES = listOf(
        "action" to "Action", "action-&-adventure" to "Action & Adventure", "adventure" to "Adventure",
        "animation" to "Animation", "comedy" to "Comedy", "crime" to "Crime", "documentary" to "Documentary",
        "drama" to "Drama", "family" to "Family", "fantasy" to "Fantasy", "history" to "History",
        "horror" to "Horror", "kids" to "Kids", "music" to "Music", "mystery" to "Mystery", "news" to "News",
        "reality" to "Reality", "romance" to "Romance", "sci-fi-&-fantasy" to "Sci-Fi & Fantasy",
        "science-fiction" to "Science Fiction", "soap" to "Soap", "talk" to "Talk", "thriller" to "Thriller",
        "tv-movie" to "TV Movie", "war" to "War", "war-&-politics" to "War & Politics", "western" to "Western",
    )

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
        .create(AnyMovieService::class.java)

    private interface AnyMovieService {
        @GET
        suspend fun getPage(@Url url: String): Document
    }

    private fun getAbsoluteUrl(url: String?): String? {
        if (url.isNullOrEmpty()) return null
        return if (url.startsWith("http")) url else "$baseUrl$url"
    }

    // swiper cards use a sr-only "Title (Year)" heading, grid listing cards show them as separate divs
    private fun parseCard(a: Element): ListItem? {
        val href = a.attr("href")
        val poster = getAbsoluteUrl(a.selectFirst("img")?.attr("src"))
        val rating = a.selectFirst(".cf-radial-progress span")?.text()?.toDoubleOrNull()

        val gridTitle = a.selectFirst(".cf-film-title")?.text()?.trim()
        val (title, released) = if (gridTitle != null) {
            gridTitle to a.selectFirst(".cf-film-year")?.text()?.trim()
        } else {
            val srOnly = a.selectFirst("h3.sr-only")?.text()?.trim().orEmpty()
            val match = Regex("""^(.*)\s\((\d{4})\)$""").find(srOnly)
            if (match != null) match.groupValues[1] to match.groupValues[2] else srOnly to null
        }
        if (title.isBlank()) return null

        return when {
            href.contains("/movie/") -> Movie(id = href.substringAfter("/movie/").removeSuffix("/"), title = title, poster = poster, released = released, rating = rating)
            href.contains("/tv/") -> TvShow(id = href.substringAfter("/tv/").removeSuffix("/"), title = title, poster = poster, released = released, rating = rating)
            else -> null
        }
    }

    private fun parseCards(root: Element, selector: String = "a.cf-film-card") =
        root.select(selector).mapNotNull { parseCard(it) }

    override suspend fun getHome(): List<Category> {
        val document = service.getPage("$baseUrl/home")

        return document.select("section:has(.cf-row-swiper)").mapNotNull { section ->
            val name = section.selectFirst(".cf-section-title")?.text()?.trim() ?: return@mapNotNull null
            val items = parseCards(section)
            if (items.isEmpty()) null else Category(name = name, list = items)
        }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return GENRES.map { (id, label) -> Genre(id, label) }
        }
        if (page > 1) return emptyList()

        val document = service.getPage("$baseUrl/search?q=${URLEncoder.encode(query, "UTF-8")}")
        return parseCards(document)
    }

    override suspend fun getMovies(page: Int): List<Movie> =
        parseCards(service.getPage("$baseUrl/movies?page=$page")).filterIsInstance<Movie>()

    override suspend fun getTvShows(page: Int): List<TvShow> =
        parseCards(service.getPage("$baseUrl/tv-shows?page=$page")).filterIsInstance<TvShow>()

    override suspend fun getGenre(id: String, page: Int): Genre {
        val document = service.getPage("$baseUrl/category/$id?page=$page")
        val name = GENRES.find { it.first == id }?.second ?: document.selectFirst(".cf-page-title")?.text()?.trim() ?: id
        return Genre(id = id, name = name, shows = parseCards(document).filterIsInstance<Show>())
    }

    private data class DetailInfo(
        val title: String, val overview: String?, val poster: String?, val banner: String?,
        val released: String?, val runtime: Int?, val genres: List<Genre>, val cast: List<People>,
        val recommendations: List<Show>,
    )

    private fun parseDetail(document: Document): DetailInfo {
        val title = document.selectFirst("h1.sr-only")?.text()?.trim() ?: ""
        val banner = getAbsoluteUrl(document.selectFirst("figure.cf-detail-backdrop img")?.attr("src"))
        val poster = getAbsoluteUrl(document.selectFirst("figure.cf-detail-poster-fig img")?.attr("src"))
        val overview = document.selectFirst("p.cf-overview-text")?.text()?.trim()

        val headingText = document.selectFirst(".cf-detail-info-col h2")?.text().orEmpty()
        val released = Regex("""\((\d{4})\)""").find(headingText)?.groupValues?.get(1)

        val runtime = document.select("div.cf-detail-meta-row span")
            .firstNotNullOfOrNull { it.text().toMinutesOrNull() }

        val genres = document.select("div.cf-detail-genres a.cf-genre-pill").map {
            Genre(id = it.attr("href").substringAfter("/category/"), name = it.text().trim())
        }
        val cast = document.select("ul.cf-cast-list a.cf-cast-item").map {
            People(
                id = it.attr("href").substringAfter("/actor/"),
                name = it.selectFirst(".cf-cast-name")?.text()?.trim() ?: "",
                image = getAbsoluteUrl(it.selectFirst("img")?.attr("src")),
            )
        }
        val recommendations = parseCards(document).filterIsInstance<Show>()

        return DetailInfo(title, overview, poster, banner, released, runtime, genres, cast, recommendations)
    }

    override suspend fun getMovie(id: String): Movie {
        val info = parseDetail(service.getPage("$baseUrl/movie/$id"))
        return Movie(
            id = id, title = info.title, overview = info.overview,
            poster = info.poster, banner = info.banner,
            released = info.released, runtime = info.runtime,
            genres = info.genres, cast = info.cast, recommendations = info.recommendations,
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val document = service.getPage("$baseUrl/tv/$id")
        val info = parseDetail(document)

        val seasonNumbers = document.select("a.cf-episode-item").mapNotNull {
            Regex("""/season/(\d+)/episode/\d+""").find(it.attr("href"))?.groupValues?.get(1)?.toIntOrNull()
        }.distinct().sorted()

        return TvShow(
            id = id, title = info.title, overview = info.overview,
            poster = info.poster, banner = info.banner,
            released = info.released, runtime = info.runtime,
            genres = info.genres, cast = info.cast, recommendations = info.recommendations,
            seasons = seasonNumbers.map { Season(id = "$id/$it", number = it, title = "Season $it") },
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val showId = seasonId.substringBeforeLast("/")
        val seasonNumber = seasonId.substringAfterLast("/").toIntOrNull() ?: return emptyList()

        val document = service.getPage("$baseUrl/tv/$showId")
        return document.select("a.cf-episode-item").mapNotNull { a ->
            val match = Regex("""/season/(\d+)/episode/(\d+)""").find(a.attr("href")) ?: return@mapNotNull null
            val (season, episode) = match.groupValues[1].toInt() to match.groupValues[2].toInt()
            if (season != seasonNumber) return@mapNotNull null
            Episode(
                id = "$showId/$season/$episode",
                number = episode,
                title = a.selectFirst(".cf-ep-title")?.text()?.trim(),
                overview = a.selectFirst(".cf-ep-desc")?.text()?.trim(),
                released = a.selectFirst(".cf-ep-meta-pill")?.text()?.trim(),
                poster = getAbsoluteUrl(a.selectFirst(".cf-ep-thumb img")?.attr("src")),
            )
        }
    }

    override suspend fun getPeople(id: String, page: Int): People {
        if (page > 1) return People(id, "")

        val document = service.getPage("$baseUrl/actor/$id")
        return People(
            id = id,
            name = document.selectFirst(".cf-actor-name")?.text()?.trim() ?: "",
            image = getAbsoluteUrl(document.selectFirst(".cf-actor-photo img")?.attr("src")),
            filmography = parseCards(document).filterIsInstance<Show>(),
        )
    }

    // its own player just proxies a vidsrc-clone by tmdb id, skip it and hit those servers directly
    private fun extractTmdbId(document: Document): String? {
        val dataSrc = document.selectFirst("iframe[data-src]")?.attr("data-src") ?: return null
        return dataSrc.trim('/').split("/").getOrNull(2)
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val tmdbId = when (videoType) {
            is Video.Type.Movie -> extractTmdbId(service.getPage("$baseUrl/movie/$id"))
            is Video.Type.Episode -> extractTmdbId(
                service.getPage("$baseUrl/tv/${videoType.tvShow.id}/season/${videoType.season.number}/episode/${videoType.number}")
            )
        } ?: return emptyList()

        val tmdbVideoType = when (videoType) {
            is Video.Type.Movie -> videoType.copy(id = tmdbId)
            is Video.Type.Episode -> videoType.copy(tvShow = videoType.tvShow.copy(id = tmdbId))
        }

        val servers = mutableListOf(
            VixSrcExtractor().server(tmdbVideoType),
            TwoEmbedExtractor().server(tmdbVideoType),
            VidsrcNetExtractor().server(tmdbVideoType),
            VidLinkExtractor().server(tmdbVideoType),
            VidsrcRuExtractor().server(tmdbVideoType),
            VidflixExtractor().server(tmdbVideoType),
        )
        if (tmdbVideoType is Video.Type.Movie) {
            servers.add(2, MoviesapiExtractor().server(tmdbVideoType))
        }
        servers.addAll(VidrockExtractor().servers(tmdbVideoType))
        servers.addAll(VidzeeExtractor().servers(tmdbVideoType))
        servers.addAll(PrimeSrcExtractor().servers(tmdbVideoType))

        return servers
    }

    override suspend fun getVideo(server: Video.Server): Video = Extractor.extract(server.src, server)

    private fun String.toMinutesOrNull(): Int? {
        val match = Regex("""(\d+)h\s*(\d+)m|(\d+)\s*min""").find(this) ?: return null
        val hours = match.groupValues[1].toIntOrNull() ?: 0
        val minutes = match.groupValues[2].toIntOrNull() ?: match.groupValues[3].toIntOrNull() ?: 0
        return hours * 60 + minutes
    }
}
