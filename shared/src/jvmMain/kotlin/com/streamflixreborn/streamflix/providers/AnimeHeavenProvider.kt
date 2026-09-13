package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.ListItem
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
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
import retrofit2.http.Header
import retrofit2.http.Headers
import retrofit2.http.Query
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object AnimeHeavenProvider : Provider {

    override val baseUrl = "https://animeheaven.me"
    override val name = "AnimeHeaven"
    override val logo = "$baseUrl/ah_logo.png"
    override val language = "en"

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private interface AnimeHeavenService {
        companion object {
            fun build(): AnimeHeavenService {
                val client = OkHttpClient.Builder()
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .dns(DnsResolver.doh)
                    .build()

                return Retrofit.Builder()
                    .baseUrl("https://animeheaven.me")
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(AnimeHeavenService::class.java)
            }
        }

        @Headers(USER_AGENT)
        @GET(".")
        suspend fun getHome(): Document

        @Headers(USER_AGENT)
        @GET("popular.php")
        suspend fun getPopular(): Document

        @Headers(USER_AGENT)
        @GET("search.php")
        suspend fun search(@Query("s") query: String): Document

        @Headers(USER_AGENT)
        @GET
        suspend fun getPage(@Url url: String): Document

        // the site sets a "key=<episode id>" cookie client side before hitting this endpoint,
        // a header does the same job without needing a real cookie jar
        @Headers(USER_AGENT)
        @GET("gate.php")
        suspend fun getGate(@Header("Cookie") cookie: String): Document
    }

    private val service = AnimeHeavenService.build()

    private fun normalizeUrl(url: String): String {
        if (url.isBlank()) return ""
        if (url.startsWith("http")) return url
        return "$baseUrl/${url.trimStart('/')}"
    }

    private fun parseListItem(a: Element): TvShow? {
        val href = a.attr("href").trim()
        if (!href.startsWith("anime.php")) return null
        val id = href.substringAfter("anime.php?").trim()
        if (id.isBlank()) return null
        val img = a.selectFirst("img") ?: return null
        val title = img.attr("alt").trim().takeIf { it.isNotBlank() } ?: return null
        val poster = normalizeUrl(img.attr("src").trim())
        return TvShow(id = id, title = title, poster = poster)
    }

    // no real seasons here, every anime is a single flat episode list
    private fun parseEpisodes(doc: Document): List<Episode> {
        return doc.select("a[onclick^=gatea]").mapNotNull { a ->
            val key = a.attr("id").trim().takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val number = a.selectFirst("div.watch2")?.text()?.trim()?.toIntOrNull() ?: return@mapNotNull null
            Episode(id = key, number = number, title = "Episode $number")
        }.distinctBy { it.number }.sortedBy { it.number }
    }

    // the site has no home genre rows of its own, these are just popular tags pulled in separately
    private val HOME_GENRES = listOf("Action", "Isekai", "Romance", "Comedy", "Fantasy")

    override suspend fun getHome(): List<Category> {
        val doc = service.getHome()
        val categories = mutableListOf<Category>()

        val featured = doc.select("#slide a[href^=anime.php]").mapNotNull { parseListItem(it) }.distinctBy { it.id }
        if (featured.isNotEmpty()) categories.add(Category(name = Category.FEATURED, list = featured))

        // this section runs to hundreds of entries, capped like the genre rows so the home page isnt loading a few hundred posters at once
        val newReleases = doc.select("div.chart div.chartimg a[href^=anime.php]").mapNotNull { parseListItem(it) }.distinctBy { it.id }.take(20)
        if (newReleases.isNotEmpty()) categories.add(Category(name = "New Releases", list = newReleases))

        coroutineScope {
            HOME_GENRES.map { genre ->
                async {
                    val genreDoc = runCatching {
                        service.getPage("$baseUrl/tags.php?tag=${URLEncoder.encode(genre, "UTF-8")}")
                    }.getOrNull()
                    val shows = genreDoc?.select("div.similarimg a[href^=anime.php]")
                        ?.mapNotNull { parseListItem(it) }?.distinctBy { it.id }?.take(20).orEmpty()
                    if (shows.isNotEmpty()) Category(name = genre, list = shows) else null
                }
            }.awaitAll().filterNotNull().forEach { categories.add(it) }
        }

        return categories
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank() || page > 1) return emptyList()

        val doc = service.search(query)
        return doc.select("div.similarimg a[href^=anime.php]").mapNotNull { parseListItem(it) }.distinctBy { it.id }
    }

    override suspend fun getMovies(page: Int): List<Movie> = throw Exception("Movies not supported")

    override suspend fun getMovie(id: String): Movie = throw Exception("Movies not supported")

    override suspend fun getTvShows(page: Int): List<TvShow> {
        if (page > 1) return emptyList()

        val doc = service.getPopular()
        return doc.select("div.chart div.chartimg a[href^=anime.php]").mapNotNull { parseListItem(it) }.distinctBy { it.id }
    }

    override suspend fun getTvShow(id: String): TvShow {
        val doc = service.getPage("$baseUrl/anime.php?$id")

        val title = doc.selectFirst("div.infotitle")?.text()?.trim() ?: ""
        val overview = doc.selectFirst("div.infodes")?.text()?.trim()
        val poster = doc.selectFirst("div.infoimg img")?.attr("src")?.trim()?.let { normalizeUrl(it) }

        val genres = doc.select("div.infotags a[href^=tags.php]").mapNotNull { a ->
            val tag = a.attr("href").substringAfter("tag=").trim()
            val label = a.text().trim()
            if (tag.isBlank() || label.isBlank()) null else Genre(id = tag, name = label)
        }

        val year = Regex("Year:\\s*(\\d{4})").find(doc.selectFirst("div.infoyear")?.text().orEmpty())
            ?.groupValues?.get(1)

        val episodes = parseEpisodes(doc)

        return TvShow(
            id = id,
            title = title,
            overview = overview,
            poster = poster,
            released = year,
            genres = genres,
            seasons = if (episodes.isNotEmpty()) listOf(Season(id = id, number = 1, episodes = episodes)) else emptyList()
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val doc = service.getPage("$baseUrl/anime.php?$seasonId")
        return parseEpisodes(doc)
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        if (page > 1) return Genre(id = id, name = id, shows = emptyList())

        val doc = service.getPage("$baseUrl/tags.php?tag=${URLEncoder.encode(id, "UTF-8")}")
        val shows = doc.select("div.similarimg a[href^=anime.php]").mapNotNull { parseListItem(it) }.distinctBy { it.id }
        return Genre(id = id, name = id, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People = throw Exception("People not supported")

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        if (videoType !is Video.Type.Episode) return emptyList()
        return listOf(Video.Server(id = id, name = "AnimeHeaven", src = id))
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val doc = service.getGate("key=${server.id}")
        val source = doc.selectFirst("video#vid source")?.attr("src")?.trim()?.takeIf { it.isNotBlank() }
            ?: throw Exception("Video source not found")

        return Video(
            source = normalizeUrl(source),
            subtitles = emptyList(),
            headers = mapOf("Referer" to "$baseUrl/")
        )
    }
}
