package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

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
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import okhttp3.OkHttpClient
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.Url
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object AnimeSugeProvider : Provider {

    override val name = "AnimeSuge"
    override val baseUrl = "https://animesuge.cz"
    override val language = "en"
    override val logo = "$baseUrl/favicon.ico"

    private val service = Service.build()

    // the ep list ajax call requires a "vrf" token: rc4 -> base64url -> position-shift ->
    // base64url -> rot13, all done client-side in the site's own main.js. ported byte-for-byte
    // since it's a fixed algorithm (no dynamic per-session key to fetch, unlike mkissa's)
    private object Vrf {
        private const val RC4_KEY = "ysJhV6U27FVIjjuk"

        fun of(animeId: String): String {
            val encoded = URLEncoder.encode(animeId, "UTF-8").replace("+", "%20")
            val rc4Out = rc4(RC4_KEY, encoded)
            val b1 = base64Url(rc4Out)
            val shifted = shiftChars(b1)
            val b2 = base64Url(shifted)
            return rot13(b2)
        }

        private fun rc4(key: String, data: String): String {
            val s = IntArray(256) { it }
            var j = 0
            for (i in 0 until 256) {
                j = (j + s[i] + key[i % key.length].code) % 256
                val tmp = s[i]; s[i] = s[j]; s[j] = tmp
            }
            var i = 0; j = 0
            val out = StringBuilder(data.length)
            for (ch in data) {
                i = (i + 1) % 256
                j = (j + s[i]) % 256
                val tmp = s[i]; s[i] = s[j]; s[j] = tmp
                val k = s[(s[i] + s[j]) % 256]
                out.append((ch.code xor k).toChar())
            }
            return out.toString()
        }

        private fun base64Url(s: String): String {
            val bytes = ByteArray(s.length) { (s[it].code and 0xFF).toByte() }
            val b64 = java.util.Base64.getEncoder().encodeToString(bytes)
            return b64.replace("/", "_").replace("+", "-")
        }

        private fun shiftChars(s: String): String {
            val out = StringBuilder(s.length)
            for ((r, ch) in s.withIndex()) {
                var code = ch.code
                code += when (r % 8) {
                    1 -> 3; 7 -> 5; 2 -> -4; 4 -> -2; 6 -> 4; 0 -> -3; 3 -> 2; 5 -> 5
                    else -> 0
                }
                out.append(code.toChar())
            }
            return out.toString()
        }

        private fun rot13(s: String): String {
            return s.map { ch ->
                if (ch.isLetter()) {
                    val code = ch.code + 13
                    val limit = if (ch <= 'Z') 90 else 122
                    (if (limit >= code) code else code - 26).toChar()
                } else ch
            }.joinToString("")
        }
    }

    private fun parseCard(item: Element): Show? {
        val href = if (item.tagName() == "a") item.attr("href") else item.selectFirst("a[href]")?.attr("href")
        if (href.isNullOrBlank()) return null
        val title = item.selectFirst(".name")?.text()?.trim().orEmpty()
            .ifEmpty { item.selectFirst("img")?.attr("alt")?.trim().orEmpty() }
        if (title.isEmpty()) return null
        val poster = item.selectFirst("img[data-src]")?.attr("data-src")
        val isMovie = item.selectFirst(".type")?.text()?.trim().equals("Movie", ignoreCase = true)

        return if (isMovie) {
            Movie(id = href, title = title, poster = poster)
        } else {
            TvShow(id = href, title = title, poster = poster, seasons = listOf(Season(id = href, number = 0)))
        }
    }

    override suspend fun getHome(): List<Category> {
        val document = service.getHome()

        return document.select("section").mapNotNull { section ->
            val heading = section.selectFirst("h2")?.text()?.trim() ?: return@mapNotNull null
            if (heading.isEmpty() || heading == "Most Viewed") return@mapNotNull null
            val items = section.select(".item").mapNotNull { parseCard(it) }
            if (items.isEmpty()) null else Category(name = heading, list = items)
        }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            val document = service.getHome()
            return document.select("div#sidebar_subs_genre a, ul.genre-list a").map {
                Genre(id = it.attr("href").substringAfterLast("/genre/"), name = it.text().trim())
            }.ifEmpty {
                // genre links live on the filter page's sidebar, not the home page
                emptyList()
            }
        }

        val document = service.getFilter(keyword = query, page = page)
        return document.select(".item").mapNotNull { parseCard(it) }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val document = service.getFilterByType(type = "Movie", page = page)
        return document.select(".item").mapNotNull { parseCard(it) as? Movie }
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val document = service.getFilterByType(type = "TV", page = page)
        return document.select(".item").mapNotNull { parseCard(it) as? TvShow }
    }

    private fun animeIdOf(document: Document): String =
        document.selectFirst("div.watch-wrap")?.attr("data-id").orEmpty()

    private fun parseInfo(document: Document, label: String): String? =
        document.select("#media-info .meta > div").firstOrNull {
            it.selectFirst("div")?.text()?.trim()?.trimEnd(':') == label
        }?.selectFirst("span")?.text()?.trim()

    override suspend fun getMovie(id: String): Movie {
        val document = service.getPage(id)
        val animeId = animeIdOf(document)

        return Movie(
            // servers/getVideo need the numeric anime id + a fresh vrf token, stash it here
            id = "$id::$animeId",
            title = document.selectFirst("#media-info h1.title")?.text()?.trim().orEmpty(),
            overview = document.selectFirst("#media-info .description .short div")?.text()?.trim(),
            released = parseInfo(document, "Aired")?.substringBefore(" to"),
            rating = parseInfo(document, "MAL")?.toDoubleOrNull(),
            poster = document.selectFirst("#media-info .poster img")?.attr("src"),
            genres = document.select("#media-info .meta > div").firstOrNull {
                it.selectFirst("div")?.text()?.trim()?.trimEnd(':') == "Genre"
            }?.select("a")?.map { Genre(id = it.attr("href").substringAfterLast("/genre/"), name = it.text().trim()) }
                ?: emptyList(),
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val document = service.getPage(id)
        val animeId = animeIdOf(document)
        val packedId = "$id::$animeId"

        return TvShow(
            id = id,
            title = document.selectFirst("#media-info h1.title")?.text()?.trim().orEmpty(),
            overview = document.selectFirst("#media-info .description .short div")?.text()?.trim(),
            released = parseInfo(document, "Aired")?.substringBefore(" to"),
            rating = parseInfo(document, "MAL")?.toDoubleOrNull(),
            poster = document.selectFirst("#media-info .poster img")?.attr("src"),
            genres = document.select("#media-info .meta > div").firstOrNull {
                it.selectFirst("div")?.text()?.trim()?.trimEnd(':') == "Genre"
            }?.select("a")?.map { Genre(id = it.attr("href").substringAfterLast("/genre/"), name = it.text().trim()) }
                ?: emptyList(),
            seasons = listOf(Season(id = packedId, number = 0, title = "Episodes")),
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val animeId = seasonId.substringAfterLast("::")
        val response = service.getEpisodeList(animeId = animeId, vrf = Vrf.of(animeId))
        if (response.status != 200) throw Exception("AnimeSuge episode list failed")

        return Jsoup.parse(response.result.orEmpty()).select("a[data-id]").map {
            Episode(
                id = it.attr("data-ids"),
                number = it.attr("data-num").substringAfter(" ").toIntOrNull() ?: 0,
                title = it.attr("title").ifBlank { null },
            )
        }
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        val document = service.getFilterByGenre(genre = id, page = page)
        return Genre(
            id = id,
            name = document.selectFirst("h1, h2")?.text()?.trim() ?: id,
            shows = document.select(".item").mapNotNull { parseCard(it) as? Show },
        )
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("People pages are not supported by AnimeSuge")
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val dataIds = when (videoType) {
            is Video.Type.Movie -> {
                val animeId = id.substringAfterLast("::")
                val response = service.getEpisodeList(animeId = animeId, vrf = Vrf.of(animeId))
                Jsoup.parse(response.result.orEmpty()).selectFirst("a[data-id]")?.attr("data-ids")
                    ?: throw Exception("AnimeSuge episode not found")
            }
            is Video.Type.Episode -> id
        }

        val response = service.getServerList(servers = dataIds)
        if (response.status != 200) return emptyList()

        return Jsoup.parse(response.result.orEmpty()).select(".server[data-link-id]").map {
            val type = it.closest("div.server-type")?.attr("data-type")?.uppercase().orEmpty()
            val name = it.selectFirst("span")?.text()?.trim().orEmpty()
            Video.Server(id = it.attr("data-link-id"), name = if (type.isNotEmpty()) "$name ($type)" else name)
        }
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val response = service.getServerLink(get = server.id)
        if (response.status != 200) throw Exception("AnimeSuge server link failed")
        val embedUrl = response.result?.url ?: throw Exception("AnimeSuge embed url not found")
        return Extractor.extract(embedUrl, server)
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
                                .header("X-Requested-With", "XMLHttpRequest")
                                .build()
                        )
                    }
                    .build()

                return Retrofit.Builder()
                    .baseUrl("https://animesuge.cz")
                    .client(client)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(Service::class.java)
            }
        }

        @GET("/")
        suspend fun getHome(): Document

        @GET("filter")
        suspend fun getFilter(@Query("keyword") keyword: String, @Query("page") page: Int): Document

        @GET("filter")
        suspend fun getFilterByType(@Query("term_type[]") type: String, @Query("page") page: Int): Document

        @GET("filter")
        suspend fun getFilterByGenre(@Query("term_genre[]") genre: String, @Query("page") page: Int): Document

        @GET
        suspend fun getPage(@Url url: String): Document

        @GET("ajax/episode/list/{animeId}")
        suspend fun getEpisodeList(@retrofit2.http.Path("animeId") animeId: String, @Query("vrf") vrf: String): AjaxResponse<String>

        @GET("ajax/server/list")
        suspend fun getServerList(@Query("servers") servers: String): AjaxResponse<String>

        @GET("ajax/server")
        suspend fun getServerLink(@Query("get") get: String): AjaxResponse<ServerLinkResult>

        data class AjaxResponse<T>(
            val status: Int = 0,
            val result: T? = null,
        )

        data class ServerLinkResult(
            val url: String? = null,
        )
    }
}
