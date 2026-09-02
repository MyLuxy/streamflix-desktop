package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

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
import com.streamflixreborn.streamflix.utils.MimeTypes
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.Url
import java.util.concurrent.TimeUnit

// server-rendered tmdb-backed catalog (ids in urls are literal tmdb ids), so scraping is mostly
// plain html. the interesting part is the watch page: it never embeds a real player itself, it
// just drops a window.PLAYER config blob with a list of upstream "providers" (multi-source
// aggregator, same family as vidsrc/2embed) and a GET /api/player/sources?type=&tmdbId=&provider=
// endpoint that scrapes that provider server-side and hands back a source. the returned url isn't
// the raw upstream link though - it's already rewritten through vuflix's own /api/player/v-relay
// proxy (master playlist, variant playlists AND segments all go through it), so no per-embed
// extractor is needed here, just carry the response's own User-Agent along with the source
object VuflixProvider : Provider {

    override val name = "Vuflix"
    override val baseUrl = "https://vuflix.co"
    override val language = "en"
    override val logo = "$baseUrl/assets/img/logo-vuflix.webp"

    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    // getServers() can list up to ~9 provider mirrors, and Backend.kt races getVideo() for all of
    // them concurrently - all landing on vuflix.co itself (the sources API), so OkHttp's default
    // dispatcher (maxRequestsPerHost = 5) queues the rest behind whichever 5 happen to start first,
    // which can add tens of seconds if a slow mirror wins that early slot. Raise the per-host cap
    // so the race is actually parallel instead of half-serialized.
    private val client = OkHttpClient.Builder()
        .dns(DnsResolver.doh)
        .dispatcher(okhttp3.Dispatcher().apply { maxRequestsPerHost = 20 })
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("User-Agent", USER_AGENT)
                    .build()
            )
        }
        .build()

    private val service = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(JsoupConverterFactory.create())
        .build()
        .create(Service::class.java)

    private interface Service {
        @GET
        suspend fun getPage(@Url url: String): Document

        @GET("movies")
        suspend fun getMovies(@Query("page") page: Int): Document

        @GET("tv-series")
        suspend fun getTvShows(@Query("page") page: Int): Document
    }

    // getVideo() below is called concurrently (once per listed provider mirror, sometimes 15+) by
    // Backend.kt's race, which cancels the losing jobs once one mirror wins. A plain blocking
    // OkHttp .execute() call doesn't honor that cancellation (cancelling a coroutine can't
    // interrupt a synchronous network read already in flight), so a single slow mirror used to
    // keep runBlocking - and the HTTP response - stuck waiting on it for as long as it took to
    // finish on its own (seen up to ~20s on a slow mirror). enqueue() + suspendCancellableCoroutine
    // ties the coroutine's cancellation to call.cancel(), which actually aborts the socket read.
    private suspend fun fetchJson(url: String, referer: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .header("Referer", referer)
            .build()
        val call = client.newCall(request)
        val response = suspendCancellableCoroutine<okhttp3.Response> { cont ->
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : okhttp3.Callback {
                override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                    cont.resume(response)
                }
                override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }
            })
        }
        return response.use {
            val body = it.body?.string().orEmpty()
            if (body.isBlank()) throw Exception("Vuflix empty response from $url")
            JSONObject(body)
        }
    }

    private fun parseCard(item: Element): Show? {
        val a = item.selectFirst("a.item-poster") ?: return null
        val href = a.attr("href").ifBlank { return null }
        val title = item.selectFirst(".card-title")?.text()?.trim()?.ifEmpty { null }
            ?: a.attr("aria-label").ifBlank { null }
            ?: return null
        val poster = item.selectFirst("img")?.let { it.attr("data-src").ifBlank { it.attr("src") } }?.ifBlank { null }
        return if (href.contains("/tv/")) {
            TvShow(id = href, title = title, poster = poster)
        } else {
            Movie(id = href, title = title, poster = poster)
        }
    }

    override suspend fun getHome(): List<Category> {
        val document = service.getPage(baseUrl)

        return document.select("h2.title").mapNotNull { heading ->
            val name = heading.ownText().trim().ifEmpty { heading.text().trim() }.ifEmpty { return@mapNotNull null }
            val section = heading.closest("div.section.section-rail") ?: return@mapNotNull null
            val items = section.select(".movie-item").mapNotNull { parseCard(it) }.distinctBy { it.id }
            if (items.isEmpty()) null else Category(name = name, list = items)
        }.distinctBy { it.name }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            val document = service.getPage(baseUrl)
            return document.select("button.filter-list-item[data-sf-genre-type=movie]").mapNotNull {
                val id = it.attr("data-sf-genre").ifBlank { return@mapNotNull null }
                val genreName = it.attr("data-label").ifBlank { return@mapNotNull null }
                Genre(id = id, name = genreName)
            }.distinctBy { it.id }
        }

        val json = fetchJson("$baseUrl/api/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}&type=all", baseUrl)
        val results = json.optJSONArray("results") ?: return emptyList()
        return (0 until results.length()).mapNotNull { i ->
            val item = results.optJSONObject(i) ?: return@mapNotNull null
            val url = item.optString("url").ifBlank { return@mapNotNull null }
            val title = item.optString("title").ifBlank { return@mapNotNull null }
            val year = item.optString("year").ifBlank { null }
            val poster = item.optString("poster").ifBlank { null }
            val rating = item.optDouble("rating", 0.0).takeIf { it > 0 }
            if (item.optString("type") == "tv") {
                TvShow(id = url, title = title, released = year, poster = poster, rating = rating)
            } else {
                Movie(id = url, title = title, released = year, poster = poster, rating = rating)
            }
        }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val document = service.getMovies(page)
        return document.select(".movie-item").mapNotNull { parseCard(it) as? Movie }
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val document = service.getTvShows(page)
        return document.select(".movie-item").mapNotNull { parseCard(it) as? TvShow }
    }

    private fun parseDetailRows(document: Document): Map<String, Element> {
        return document.select(".detail > div").mapNotNull { row ->
            val label = row.children().getOrNull(0)?.text()?.trim()?.removeSuffix(":") ?: return@mapNotNull null
            val value = row.children().getOrNull(1) ?: return@mapNotNull null
            label to value
        }.toMap()
    }

    override suspend fun getMovie(id: String): Movie {
        val document = service.getPage(id)
        val rows = parseDetailRows(document)

        return Movie(
            id = id,
            title = document.selectFirst("h1.name")?.text()?.trim().orEmpty(),
            overview = document.selectFirst(".w-desc")?.text()?.trim(),
            released = rows["Release Date"]?.text()?.trim(),
            runtime = Regex("""(\d+)\s*min""").find(document.selectFirst(".meta")?.text().orEmpty())
                ?.groupValues?.getOrNull(1)?.toIntOrNull(),
            rating = document.selectFirst(".rating-box-value")?.text()?.toDoubleOrNull(),
            poster = document.selectFirst("meta[property=og:image]")?.attr("content"),
            banner = document.selectFirst("meta[property=og:image]")?.attr("content"),
            genres = rows["Genre"]?.select("a")?.map {
                Genre(
                    id = Regex("""with_genres\[]=(\d+)""").find(it.attr("href"))?.groupValues?.getOrNull(1).orEmpty(),
                    name = it.text().trim(),
                )
            }.orEmpty(),
            directors = rows["Director"]?.select("a")?.map {
                People(
                    id = it.attr("href"),
                    name = it.text().trim(),
                )
            }.orEmpty(),
            cast = document.select(".watch-cast .cast-item-link").map {
                People(
                    id = it.attr("href"),
                    name = it.selectFirst(".name")?.text()?.trim() ?: it.attr("title"),
                    image = it.selectFirst("img")?.let { img -> img.attr("data-src").ifBlank { img.attr("src") } }?.ifBlank { null },
                )
            },
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val document = service.getPage(id)
        val rows = parseDetailRows(document)

        val seasons = document.select("a.season-item").mapNotNull { a ->
            val num = Regex("""[?&]s=(\d+)""").find(a.attr("href"))?.groupValues?.getOrNull(1)?.toIntOrNull()
                ?: return@mapNotNull null
            Season(id = "$id::$num", number = num, title = a.selectFirst("span")?.text()?.trim() ?: "Season $num")
        }.distinctBy { it.number }.ifEmpty {
            listOf(Season(id = "$id::1", number = 1, title = "Season 1"))
        }

        return TvShow(
            id = id,
            title = document.selectFirst("h1.name")?.text()?.trim().orEmpty(),
            overview = document.selectFirst(".w-desc")?.text()?.trim(),
            released = rows["Release Date"]?.text()?.trim() ?: rows["First Air Date"]?.text()?.trim(),
            rating = document.selectFirst(".rating-box-value")?.text()?.toDoubleOrNull(),
            poster = document.selectFirst("meta[property=og:image]")?.attr("content"),
            banner = document.selectFirst("meta[property=og:image]")?.attr("content"),
            seasons = seasons,
            genres = rows["Genre"]?.select("a")?.map {
                Genre(
                    id = Regex("""with_genres\[]=(\d+)""").find(it.attr("href"))?.groupValues?.getOrNull(1).orEmpty(),
                    name = it.text().trim(),
                )
            }.orEmpty(),
            cast = document.select(".watch-cast .cast-item-link").map {
                People(
                    id = it.attr("href"),
                    name = it.selectFirst(".name")?.text()?.trim() ?: it.attr("title"),
                    image = it.selectFirst("img")?.let { img -> img.attr("data-src").ifBlank { img.attr("src") } }?.ifBlank { null },
                )
            },
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val parts = seasonId.split("::")
        if (parts.size != 2) throw Exception("Vuflix malformed season id")
        val (tvShowId, season) = parts
        val tmdbId = tvShowId.trimEnd('/').substringAfterLast("/")

        val json = fetchJson("$baseUrl/api/player/episodes?type=tv&tmdbId=$tmdbId&season=$season", tvShowId)
        val episodes = json.optJSONArray("episodes") ?: return emptyList()

        return (0 until episodes.length()).mapNotNull { i ->
            val ep = episodes.optJSONObject(i) ?: return@mapNotNull null
            val number = ep.optInt("episode", -1).takeIf { it >= 0 } ?: return@mapNotNull null
            Episode(
                id = "$tvShowId::$season::$number",
                number = number,
                title = ep.optString("title").ifBlank { null },
                released = ep.optString("airDate").ifBlank { null },
                poster = ep.optString("still").ifBlank { null },
                overview = ep.optString("overview").ifBlank { null },
            )
        }
    }

    override suspend fun getGenre(id: String, page: Int): Genre = coroutineScope {
        val pageQuery = if (page <= 1) "" else "&page=$page"
        val moviesDeferred = async {
            try {
                service.getPage("$baseUrl/movies?with_genres[]=$id$pageQuery")
                    .select(".movie-item").mapNotNull { parseCard(it) }
            } catch (e: Exception) {
                emptyList()
            }
        }
        val tvDeferred = async {
            try {
                service.getPage("$baseUrl/tv-series?with_genres[]=$id$pageQuery")
                    .select(".movie-item").mapNotNull { parseCard(it) }
            } catch (e: Exception) {
                emptyList()
            }
        }

        val shows = (moviesDeferred.await() + tvDeferred.await()).distinctBy { it.id }
        Genre(id = id, name = id, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People {
        val document = service.getPage(id)

        return People(
            id = id,
            name = document.selectFirst("h1.person-name")?.text()?.trim().orEmpty(),
            image = document.selectFirst(".person-portrait img")?.attr("src")?.ifBlank { null },
            biography = document.selectFirst("#person-bio")?.text()?.trim(),
            placeOfBirth = document.selectFirst(".person-place")?.text()?.trim(),
            filmography = document.select(".movie-item").mapNotNull { parseCard(it) },
        )
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val (mediaType, tvShowId, season, episode) = when (videoType) {
            is Video.Type.Movie -> listOf("movie", id, "0", "0")
            is Video.Type.Episode -> {
                val parts = id.split("::")
                if (parts.size != 3) throw Exception("Vuflix malformed episode id")
                listOf("tv", parts[0], parts[1], parts[2])
            }
        }
        val tmdbId = tvShowId.trimEnd('/').substringAfterLast("/")

        val document = service.getPage(tvShowId)
        val scriptData = document.select("script").firstOrNull { it.data().contains("window.PLAYER") }?.data()
            ?: throw Exception("Vuflix player config not found")
        val playerJson = Regex("""window\.PLAYER\s*=\s*(\{.*\});""").find(scriptData)
            ?.groupValues?.getOrNull(1)
            ?: throw Exception("Vuflix player config not found")
        val providers = JSONObject(playerJson).optJSONArray("providers") ?: throw Exception("Vuflix no providers found")

        return (0 until providers.length()).mapNotNull { i ->
            val p = providers.optJSONObject(i) ?: return@mapNotNull null
            val providerId = p.optString("id").ifBlank { return@mapNotNull null }
            val label = p.optString("publicLabel").ifBlank { p.optString("name") }.ifBlank { providerId }
            Video.Server(id = "$mediaType::$tmdbId::$season::$episode::$providerId::$tvShowId", name = label)
        }
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val parts = server.id.split("::")
        if (parts.size != 6) throw Exception("Vuflix malformed server id")
        val mediaType = parts[0]
        val tmdbId = parts[1]
        val season = parts[2]
        val episode = parts[3]
        val providerId = parts[4]
        val tvShowId = parts[5]

        val referer = if (mediaType == "tv") "$tvShowId?s=$season&e=$episode" else tvShowId
        val sourcesUrl = buildString {
            append("$baseUrl/api/player/sources?type=$mediaType&tmdbId=$tmdbId&provider=$providerId")
            if (mediaType == "tv") append("&season=$season&episode=$episode")
        }

        val json = fetchJson(sourcesUrl, referer)
        if (!json.optBoolean("ok", false)) {
            throw Exception(json.optString("error").ifBlank { "Vuflix no sources found for $providerId" })
        }
        val sources = json.optJSONArray("sources")
        if (sources == null || sources.length() == 0) throw Exception("Vuflix no sources found for $providerId")
        val best = sources.optJSONObject(0) ?: throw Exception("Vuflix malformed source entry")
        val url = best.optString("url").ifBlank { throw Exception("Vuflix source url missing") }

        val subtitles = json.optJSONArray("subtitles")
        val subs = if (subtitles != null) (0 until subtitles.length()).mapNotNull { i ->
            val sub = subtitles.optJSONObject(i) ?: return@mapNotNull null
            val file = sub.optString("url").ifBlank { sub.optString("file") }.ifBlank { return@mapNotNull null }
            Video.Subtitle(label = sub.optString("label").ifBlank { sub.optString("lang") }, file = file)
        } else emptyList()

        return Video(
            source = url,
            subtitles = subs,
            headers = mapOf("User-Agent" to USER_AGENT, "Referer" to referer),
            type = if (best.optString("type") == "hls") MimeTypes.APPLICATION_M3U8 else MimeTypes.VIDEO_MP4,
        )
    }
}
