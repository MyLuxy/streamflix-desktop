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
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Path
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object VostFreeProvider : Provider {

    override val baseUrl = "https://ipv4.vostfree.ws"
    override val name = "VostFree"
    override val logo = "$baseUrl/templates/Animix/images/favicon.ico"
    override val language = "fr"

    private val GENRES = listOf(
        "Action", "Aventure", "Comédie", "Tranche de vie", "Drame", "Fantasy",
        "Surnaturel", "Mystère", "Shonen", "Psychologique", "Romance", "Sci-Fi",
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
                    .baseUrl("https://ipv4.vostfree.ws")
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(Service::class.java)
            }
        }

        @Headers(USER_AGENT)
        @GET
        suspend fun getPage(@Url url: String): Document

        @Headers(USER_AGENT)
        @GET("{id}.html")
        suspend fun getItem(@Path("id") id: String): Document
    }

    // items across every listing template (home rails, category pages, genre pages) always start
    // with the detail-page link as their first <a>, and the poster as their first <img>
    private fun parseCard(el: Element, isMovie: Boolean): ListItem? {
        val a = el.selectFirst("a[href]") ?: return null
        val href = a.attr("href")
        if (!href.endsWith(".html")) return null
        val id = href.substringAfterLast("/").substringBeforeLast(".html")
        val poster = el.selectFirst("img")?.attr("src")
        val titleEl = el.selectFirst(".info .title")
        val title = titleEl?.ownText()?.trim()?.ifBlank { titleEl.text().trim() }
            ?: a.attr("title").takeIf { it.isNotBlank() }
            ?: a.attr("alt").takeIf { it.isNotBlank() }
            ?: return null

        return if (isMovie) Movie(id = id, title = title, poster = poster)
        else TvShow(id = id, title = title, poster = poster)
    }

    // genre pages mix movies and shows, tv items have a "kp"/"year" alt block (saison/episode),
    // movies have "kp3"/"year3" (année/durée) instead
    private fun parseGenreCard(el: Element): ListItem? =
        parseCard(el, isMovie = el.selectFirst("div.alt div.kp") == null)

    private fun parseListing(document: Document, isMovie: Boolean): List<ListItem> =
        document.select("ul.movie-small > li, div.top-articles, div.movie-poster").mapNotNull { parseCard(it, isMovie) }

    // the homepage's own "Top" widgets only ever show 5 items, not enough to scroll,
    // so build rows from the same full listing pages getMovies/getTvShows use instead
    override suspend fun getHome(): List<Category> = withContext(Dispatchers.IO) {
        val vostfr = async { fetchListing("animes-vostfr/page/1/", isMovie = false) }
        val vf = async { fetchListing("animes-vf/page/1/", isMovie = false) }
        val films = async { fetchListing("films-vf-vostfr/page/1/", isMovie = true) }

        listOfNotNull(
            vostfr.await().takeIf { it.isNotEmpty() }?.let { Category("Animes VOSTFR", it) },
            vf.await().takeIf { it.isNotEmpty() }?.let { Category("Animes VF", it) },
            films.await().takeIf { it.isNotEmpty() }?.let { Category("Films", it) },
        )
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return GENRES.map { Genre(id = it, name = it) }
        }
        if (page > 1) return emptyList()

        val document = service.getPage("$baseUrl/index.php?do=search&subaction=search&story=${URLEncoder.encode(query, "UTF-8")}")
        return document.select("div.movie-poster").mapNotNull { parseGenreCard(it) }
    }

    override suspend fun getMovies(page: Int): List<Movie> =
        fetchListing("films-vf-vostfr/page/$page/", isMovie = true).filterIsInstance<Movie>()

    override suspend fun getTvShows(page: Int): List<TvShow> = withContext(Dispatchers.IO) {
        val vf = async { fetchListing("animes-vf/page/$page/", isMovie = false) }
        val vostfr = async { fetchListing("animes-vostfr/page/$page/", isMovie = false) }
        (vf.await() + vostfr.await()).filterIsInstance<TvShow>().distinctBy { it.id }
    }

    // some listing pages repeat a few cards (a "top" widget bleeding into the paginated list below it)
    private suspend fun fetchListing(path: String, isMovie: Boolean): List<ListItem> {
        return try {
            parseListing(service.getPage("$baseUrl/$path"), isMovie)
                .distinctBy { (it as? Movie)?.id ?: (it as? TvShow)?.id }
        } catch (e: HttpException) {
            if (e.code() == 404) emptyList() else throw e
        }
    }

    override suspend fun getMovie(id: String): Movie {
        val document = service.getItem(id)
        val details = parseDetails(document)

        return Movie(
            id = id,
            title = details.title,
            overview = details.overview,
            released = details.released,
            poster = details.poster,
            banner = details.poster,
            genres = details.genres,
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val document = service.getItem(id)
        val details = parseDetails(document)

        return TvShow(
            id = id,
            title = details.title,
            overview = details.overview,
            released = details.released,
            poster = details.poster,
            banner = details.poster,
            genres = details.genres,
            seasons = listOf(Season(id = id, number = 1, title = "Episodes")),
        )
    }

    private data class Details(val title: String, val overview: String?, val released: String?, val poster: String?, val genres: List<Genre>)

    private fun parseDetails(document: Document): Details {
        val title = document.selectFirst("div.slide-middle h1")?.text()?.trim() ?: ""
        val overview = document.selectFirst("div.slide-desc")?.let { desc ->
            desc.clone().apply { select("span.cast").remove() }.text().trim()
        }
        val released = document.select("ul.slide-top li").firstOrNull { it.text().contains("Date") }
            ?.selectFirst("a")?.text()
        val poster = document.selectFirst("div.slide-poster img")?.attr("src")
        val genres = document.select("ul.slide-top li a[href*=/genre/]").map {
            Genre(id = it.text().trim(), name = it.text().trim())
        }

        return Details(title, overview, released, poster, genres)
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val document = service.getItem(seasonId)
        return document.select("select.new_player_selector option").mapNotNull { option ->
            val number = option.attr("value").removePrefix("buttons_").toIntOrNull() ?: return@mapNotNull null
            Episode(id = "${seasonId}_$number", number = number)
        }
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        val document = try {
            service.getPage("$baseUrl/genre/${URLEncoder.encode(id, "UTF-8")}/page/$page/")
        } catch (e: HttpException) {
            if (e.code() == 404) return Genre(id, id) else throw e
        }
        val shows = document.select("div.movie-poster").mapNotNull { parseGenreCard(it) }
        return Genre(id = id, name = id, shows = shows.filterIsInstance<Show>())
    }

    override suspend fun getPeople(id: String, page: Int): People = People(id = id, name = id)

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val (showId, buttonIndex) = when (videoType) {
            is Video.Type.Movie -> id to 1
            is Video.Type.Episode -> id.substringBeforeLast("_") to (id.substringAfterLast("_").toIntOrNull() ?: 1)
        }

        val document = service.getItem(showId)
        val buttonBox = document.selectFirst("div#buttons_$buttonIndex") ?: return emptyList()

        return buttonBox.select("div[id^=player_]").mapNotNull { playerDiv ->
            val hostSlug = playerDiv.className().substringBefore(' ').removePrefix("new_player_")
            val label = playerDiv.text().trim().ifBlank { hostSlug.replaceFirstChar { it.uppercase() } }
            val playerNum = playerDiv.id().removePrefix("player_")
            val content = document.selectFirst("div#content_player_$playerNum")?.text()?.trim()
                ?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val src = buildEmbedUrl(hostSlug, content) ?: return@mapNotNull null

            Video.Server(id = playerDiv.id(), name = label, src = src)
        }
    }

    // the site's own player already gives us the fully resolved embed link in most cases (see anime.js),
    // only a handful of hosts need the raw id turned into a url ourselves
    private fun buildEmbedUrl(hostSlug: String, content: String): String? {
        if (content.startsWith("http")) return content

        return when (hostSlug) {
            "sibnet" -> "https://video.sibnet.ru/shell.php?videoid=$content"
            "uqload" -> "https://uqload.cx/embed-$content.html"
            "ok" -> "https://www.ok.ru/videoembed/$content"
            "mail", "mail2" -> "https://my.mail.ru/video/embed/$content"
            "mp4" -> "https://www.mp4upload.com/embed-$content.html"
            "dailymotion" -> "https://dailymotion.com/embed/video/$content"
            "google" -> "https://drive.google.com/open?id=$content"
            "gtv" -> "https://iframedream.com/embed/$content.html"
            "rutube" -> "https://rutube.ru/play/embed/$content"
            "myvi" -> "https://myvi.ru/player/embed/html/$content"
            "mytv" -> "https://www.myvi.top/embed/$content"
            "kaztube" -> "https://kaztube.kz/video/embed/$content"
            else -> null
        }
    }

    override suspend fun getVideo(server: Video.Server): Video = Extractor.extract(server.src, server)
}
