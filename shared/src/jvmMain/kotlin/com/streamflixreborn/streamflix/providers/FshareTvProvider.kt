package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.MimeTypes
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.Url
import java.util.concurrent.TimeUnit

// movie-only site (no tv shows section at all - nav is just "movies by year/category/country").
// the detail page (/movie/{slug}) only shows a trailer; the real file only streams from a
// separate /w/{slug} watch page, which embeds a one-time file id that /api/file/{id}/source
// resolves to a real, byte-range-able progressive mp4 - no hls/obfuscation involved here
object FshareTvProvider : Provider {

    override val name = "FshareTV"
    override val baseUrl = "https://fsharetv.co"
    override val language = "en"
    override val logo = "https://fsharetv.co/favicon.ico"

    private val service = Service.build()

    private fun parseCard(item: Element): Movie? {
        val links = item.select("a")
        val href = links.firstOrNull { it.attr("href").startsWith("/movie/") }?.attr("href") ?: return null
        val title = item.selectFirst("b")?.text()?.trim().orEmpty().ifEmpty { return null }
        val poster = item.selectFirst("img.img-responsive")?.attr("src")
        return Movie(id = href, title = title, poster = poster)
    }

    override suspend fun getHome(): List<Category> {
        val document = service.getPage(baseUrl)

        return document.select("h1").mapNotNull { heading ->
            val name = heading.text().trim().removePrefix("#").trim()
            if (name.isEmpty()) return@mapNotNull null
            // each section is a flat "<h1>...</h1><div class="columns">...</div>" pair, all as
            // siblings under one shared container - selectFirst(".columns") on the shared parent
            // would always return the very first section's grid, so walk to the next sibling instead
            // (stopping at the next h1, so a heading with no grid - e.g. a filter form - yields none)
            val grid = generateSequence(heading.nextElementSibling()) { it.nextElementSibling() }
                .takeWhile { it.tagName() != "h1" }
                .firstOrNull { it.hasClass("columns") } ?: return@mapNotNull null
            val items = grid.select(".movie-item").mapNotNull { parseCard(it) }
            if (items.isEmpty()) null else Category(name = name, list = items)
        }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            return listOf(
                "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama",
                "Family", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction",
                "Thriller", "War", "Western",
            ).map { Genre(id = it, name = it) }
        }
        if (page > 1) return emptyList()

        val response = service.autocompleteSearch(query)
        return response.data?.movies.orEmpty().map {
            Movie(id = it.uri.orEmpty(), title = "${it.title} (${it.year})", poster = it.poster)
        }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val document = service.getCategory("new", page)
        return document.select(".movie-item").mapNotNull { parseCard(it) }
    }

    override suspend fun getTvShows(page: Int): List<TvShow> = emptyList()

    override suspend fun getMovie(id: String): Movie {
        val document = service.getPage(id)
        val genreText = document.selectFirst("[itemprop=genre]")?.text().orEmpty()
        val runtimeText = document.selectFirst("[itemprop=duration] [itemprop=name]")?.text().orEmpty()

        return Movie(
            id = id,
            title = document.selectFirst("#movie-title")?.text()?.trim().orEmpty(),
            overview = document.selectFirst("meta[name=description]")?.attr("content")?.substringAfter(" | "),
            released = document.selectFirst("#movie-year")?.text()?.trim(),
            runtime = Regex("""(\d+)""").find(runtimeText)?.groupValues?.getOrNull(1)?.toIntOrNull(),
            rating = document.selectFirst("[itemprop=ratingValue]")?.text()?.toDoubleOrNull(),
            poster = document.selectFirst("img[itemprop=image]")?.attr("src"),
            genres = genreText.split(",").map { it.trim() }.filter { it.isNotEmpty() }.map { Genre(id = it, name = it) },
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        throw Exception("FshareTV does not support TV shows")
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> = emptyList()

    override suspend fun getGenre(id: String, page: Int): Genre {
        val document = service.getCategory(id, page)
        return Genre(
            id = id,
            name = id,
            shows = document.select(".movie-item").mapNotNull { parseCard(it) },
        )
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("People pages are not supported by FshareTV")
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val document = service.getPage(id)
        val watchUrl = document.selectFirst("a[href^='/w/']")?.attr("abs:href")
            ?: throw Exception("FshareTV watch link not found")

        val watchDocument = service.getPage(watchUrl)
        val fileId = Regex("""Movie\.setSource\('([^']+)'""").find(watchDocument.outerHtml())?.groupValues?.getOrNull(1)
            ?: throw Exception("FshareTV file id not found")

        return listOf(Video.Server(id = "$watchUrl::$fileId", name = "FshareTV"))
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val (watchUrl, fileId) = server.id.split("::").let {
            if (it.size != 2) throw Exception("FshareTV malformed server id") else it
        }

        val response = service.getSource(fileId, referer = watchUrl)
        val sources = response.data?.file?.sources.orEmpty()
        val best = sources.maxByOrNull { it.quality ?: 0 } ?: throw Exception("FshareTV no source found")
        val src = best.src ?: throw Exception("FshareTV source url missing")
        val absoluteSrc = if (src.startsWith("http")) src else "$baseUrl$src"

        // the desktop backend's own http client doesn't carry custom headers across a
        // cross-host redirect (a jdk HttpClient default, not something we control there), and
        // this link 302s from fsharetv.co to a random vXcdn.sbs host that requires our Referer
        // - so resolve that redirect ourselves and hand the backend the final CDN url directly
        val finalUrl = resolveRedirect(absoluteSrc, watchUrl)

        return Video(
            source = finalUrl,
            headers = mapOf(
                "Referer" to watchUrl,
                "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ),
            type = MimeTypes.VIDEO_MP4,
        )
    }

    private fun resolveRedirect(url: String, referer: String): String {
        val noRedirectClient = OkHttpClient.Builder()
            .dns(DnsResolver.doh)
            .followRedirects(false)
            .followSslRedirects(false)
            .readTimeout(30, TimeUnit.SECONDS)
            .connectTimeout(30, TimeUnit.SECONDS)
            .build()

        val request = okhttp3.Request.Builder()
            .url(url)
            .header("Referer", referer)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()

        return noRedirectClient.newCall(request).execute().use { response ->
            response.header("Location") ?: url
        }
    }

    private interface Service {

        companion object {
            fun build(): Service {
                val client = OkHttpClient.Builder()
                    .dns(DnsResolver.doh)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .addInterceptor { chain ->
                        chain.proceed(
                            chain.request().newBuilder()
                                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                                .build()
                        )
                    }
                    .build()

                return Retrofit.Builder()
                    .baseUrl("https://fsharetv.co")
                    .client(client)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(Service::class.java)
            }
        }

        @GET
        suspend fun getPage(@Url url: String): Document

        @GET("category/{id}")
        suspend fun getCategory(@retrofit2.http.Path("id") id: String, @Query("page") page: Int): Document

        @GET("api/movie/autocomplete-search")
        suspend fun autocompleteSearch(@Query("query") query: String): AutocompleteResponse

        @GET("api/file/{id}/source")
        suspend fun getSource(
            @retrofit2.http.Path("id") id: String,
            @Query("trailer") trailer: Int = 0,
            @Query("type") type: String = "watch",
            @retrofit2.http.Header("Referer") referer: String,
            @retrofit2.http.Header("X-Requested-With") requestedWith: String = "XMLHttpRequest",
        ): SourceResponse

        data class AutocompleteResponse(val data: AutocompleteData? = null)
        data class AutocompleteData(val movies: List<AutocompleteMovie>? = null)
        data class AutocompleteMovie(val title: String? = null, val year: String? = null, val poster: String? = null, val uri: String? = null)

        data class SourceResponse(val data: SourceData? = null)
        data class SourceData(val file: SourceFile? = null)
        data class SourceFile(val sources: List<MediaSource>? = null)
        data class MediaSource(val src: String? = null, val label: String? = null, val quality: Int? = null)
    }
}
