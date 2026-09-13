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
import okhttp3.OkHttpClient
import org.json.JSONObject
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.Calendar
import java.util.concurrent.TimeUnit

object Anime123HubProvider : Provider {

    override val baseUrl = "https://123animehub.cc"
    override val name = "123AnimeHub"
    override val logo = "$baseUrl/favicon.ico"
    override val language = "en"

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    // the only server tab every tested title actually resolves through, see extract()
    private const val SERVER_NAME = "vidstreaming.io"

    private interface Anime123HubService {
        companion object {
            fun build(): Anime123HubService {
                val client = OkHttpClient.Builder()
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .dns(DnsResolver.doh)
                    .build()

                return Retrofit.Builder()
                    .baseUrl("https://123animehub.cc")
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(Anime123HubService::class.java)
            }
        }

        @Headers(USER_AGENT)
        @GET
        suspend fun getPage(@Url url: String): Document
    }

    private val service = Anime123HubService.build()

    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .dns(DnsResolver.doh)
        .build()

    private fun get(url: String): String {
        val request = okhttp3.Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT.substringAfter(": "))
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code} for $url")
            return response.body?.string().orEmpty()
        }
    }

    private fun slugOf(url: String): String = url.trim().trimEnd('/').substringAfterLast('/')

    // every poster on this site is served from a relative path, the browser only gets away with
    // that because it's requesting from the same origin - we aren't, so it has to be made absolute
    private fun normalizePoster(url: String?): String? {
        val trimmed = url?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return if (trimmed.startsWith("http")) trimmed else "$baseUrl/${trimmed.trimStart('/')}"
    }

    // listing cards only carry a slug-derived title (naive title-case of the url, no colons, roman
    // numerals lowercased) - the real one only exists on the show's own page. this at least undoes
    // the roman numeral mangling, which otherwise tanks the tmdb/anilist artwork lookup for sequels
    private val ROMAN_NUMERAL_WORDS = setOf("ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x")

    private fun fixSlugTitle(title: String): String =
        title.split(" ").joinToString(" ") { word -> if (word.lowercase() in ROMAN_NUMERAL_WORDS) word.uppercase() else word }

    private fun parseCard(el: Element): Show? {
        val a = el.selectFirst("a.poster") ?: return null
        val href = a.attr("href").takeIf { it.isNotBlank() } ?: return null
        val id = slugOf(href)
        val img = a.selectFirst("img")
        val poster = normalizePoster(
            img?.attr("data-src")?.takeIf { it.isNotBlank() }
                ?: img?.attr("src")?.takeIf { it.isNotBlank() && !it.contains("no_poster") }
        )
        val title = (el.selectFirst("a.name")?.attr("data-jtitle")?.trim()?.takeIf { it.isNotBlank() }
            ?: img?.attr("alt")?.trim().orEmpty()).let { fixSlugTitle(it) }
        val isMovie = a.attr("data-tip").contains("/movie/", ignoreCase = true) ||
            el.selectFirst("span.dub, span.sub")?.parent()?.text()?.contains("Movie", ignoreCase = true) == true
        if (title.isBlank() || id.isBlank()) return null

        return if (isMovie) {
            Movie(id = id, title = title, poster = poster)
        } else {
            TvShow(id = id, title = title, poster = poster)
        }
    }

    private fun parseListing(doc: Document): List<Show> =
        doc.select("div.film-list div.item").mapNotNull { parseCard(it) }.distinctBy { it.id }

    private val HOME_GENRES = listOf("Action", "Comedy", "Romance", "Fantasy", "Supernatural")

    override suspend fun getHome(): List<Category> {
        val categories = mutableListOf<Category>()
        val year = Calendar.getInstance().get(Calendar.YEAR)

        val latest = parseListing(service.getPage("$baseUrl/release/$year"))
        if (latest.isNotEmpty()) categories.add(Category(name = Category.FEATURED, list = latest.take(20)))

        HOME_GENRES.forEach { genre ->
            val shows = runCatching { parseListing(service.getPage("$baseUrl/genere/$genre")) }.getOrDefault(emptyList())
            if (shows.isNotEmpty()) categories.add(Category(name = genre, list = shows.take(20)))
        }

        return categories
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return HOME_GENRES.map { Genre(id = it, name = it) }
        }

        val url = "$baseUrl/search?keyword=${URLEncoder.encode(query, "UTF-8")}" + if (page > 1) "&page=$page" else ""
        return parseListing(service.getPage(url))
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val url = "$baseUrl/type/movies/" + if (page > 1) "?page=$page" else ""
        return parseListing(service.getPage(url)).filterIsInstance<Movie>()
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val url = "$baseUrl/type/tv-series/" + if (page > 1) "?page=$page" else ""
        return parseListing(service.getPage(url)).filterIsInstance<TvShow>()
    }

    private fun parseGenres(doc: Document): List<Genre> =
        doc.select("dl.meta dd a[href*=/genere/]").mapNotNull { a ->
            val label = a.text().trim().takeIf { it.isNotBlank() } ?: return@mapNotNull null
            Genre(id = label, name = label)
        }

    private fun parseMetaValue(doc: Document, label: String): String? =
        doc.selectFirst("dl.meta dt:containsOwn($label)")?.nextElementSibling()?.text()?.trim()?.takeIf { it.isNotBlank() }

    override suspend fun getMovie(id: String): Movie {
        val doc = service.getPage("$baseUrl/anime/$id")
        val title = doc.selectFirst("div.widget.info h2.title")?.text()?.trim()
            ?: doc.selectFirst("h1.title")?.text()?.trim() ?: ""
        val poster = normalizePoster(doc.selectFirst("div.widget.info div.thumb img")?.attr("src"))

        return Movie(
            id = id,
            title = title,
            poster = poster,
            overview = doc.selectFirst("div.desc")?.text()?.trim()?.takeIf { it.isNotBlank() },
            released = parseMetaValue(doc, "Released:"),
            genres = parseGenres(doc),
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val doc = service.getPage("$baseUrl/anime/$id")
        val title = doc.selectFirst("div.widget.info h2.title")?.text()?.trim()
            ?: doc.selectFirst("h1.title")?.text()?.trim() ?: ""
        val poster = normalizePoster(doc.selectFirst("div.widget.info div.thumb img")?.attr("src"))

        val episodes = fetchEpisodes(id)

        return TvShow(
            id = id,
            title = title,
            poster = poster,
            overview = doc.selectFirst("div.desc")?.text()?.trim()?.takeIf { it.isNotBlank() },
            released = parseMetaValue(doc, "Released:"),
            genres = parseGenres(doc),
            seasons = if (episodes.isNotEmpty()) listOf(Season(id = id, number = 1, episodes = episodes)) else emptyList(),
        )
    }

    private fun fetchEpisodes(showId: String): List<Episode> {
        val json = JSONObject(get("$baseUrl/ajax/film/sv?id=$showId"))
        val html = json.optString("html")
        if (html.isBlank()) return emptyList()
        val fragment = Jsoup.parse(html)

        return fragment.select("ul.episodes li a").mapNotNull { a ->
            val number = a.text().trim().toIntOrNull() ?: return@mapNotNull null
            Episode(id = "$showId#$number", number = number, title = "Episode $number")
        }.distinctBy { it.number }.sortedBy { it.number }
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> = fetchEpisodes(seasonId)

    override suspend fun getGenre(id: String, page: Int): Genre {
        val url = "$baseUrl/genere/${URLEncoder.encode(id, "UTF-8")}" + if (page > 1) "?page=$page" else ""
        val shows = runCatching { parseListing(service.getPage(url)) }.getOrDefault(emptyList())
        return Genre(id = id, name = id, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People = throw Exception("People not supported")

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val episodeRef = when (videoType) {
            is Video.Type.Movie -> "$id/1"
            is Video.Type.Episode -> {
                val showId = id.substringBefore('#')
                val number = id.substringAfter('#').toIntOrNull() ?: 1
                "$showId/$number"
            }
        }
        return listOf(Video.Server(id = episodeRef, name = "123AnimeHub"))
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val infoJson = JSONObject(get("$baseUrl/ajax/episode/info?epr=${server.id}/$SERVER_NAME"))
        val target = infoJson.optString("target").takeIf { it.isNotBlank() } ?: throw Exception("No embed target")

        val embedToken = target.substringAfterLast("/embed-").substringAfter("/")
        val sourcesJson = JSONObject(get("https://play2.echovideo.ru/hs/getSources?id=$embedToken"))
        val sourceUrl = sourcesJson.optString("sources").takeIf { it.isNotBlank() } ?: throw Exception("No sources returned")

        return Video(
            source = sourceUrl,
            subtitles = emptyList(),
        )
    }
}
