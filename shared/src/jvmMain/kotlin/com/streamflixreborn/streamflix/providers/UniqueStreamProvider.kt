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
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.FieldMap
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Url
import java.util.Base64
import java.util.concurrent.TimeUnit

// this site's manifests are deliberately never a plain GET-able .m3u8 - they're delivered as a
// POST response body under a fake "usv2://" scheme so casual download managers can't sniff them.
// segments themselves stay ordinary GETs though (see the embed page's own comments), so we just
// replicate the two POST calls the player itself makes and hand the real playlist text straight
// through as a data: url instead of trying to make it "GET-able" ourselves
object UniqueStreamProvider : Provider {

    override val name = "UniqueStream"
    override val baseUrl = "https://uniquestream.net"
    override val language = "en"
    override val logo = "https://uniquestream.net/wp-content/uploads/2025/05/uniquestream.png"

    private val service = Service.build()

    private fun parseHomeCard(article: Element): Show? {
        val a = article.selectFirst("a.card-link") ?: return null
        val href = a.attr("href").ifBlank { return null }
        val img = a.selectFirst("img")
        val title = img?.attr("alt")?.trim().orEmpty().ifEmpty { return null }
        val poster = img?.attr("src")
        // not every module's card carries a .type-badge (the dedicated movies/tv carousels
        // don't bother, they're already single-type) - the url path is always reliable
        val isMovie = article.selectFirst(".type-badge")?.text()?.trim()?.equals("Movie", ignoreCase = true)
            ?: href.contains("/movies/")

        return if (isMovie) {
            Movie(id = href, title = title, poster = poster)
        } else {
            TvShow(id = href, title = title, poster = poster, seasons = listOf(Season(id = href, number = 0)))
        }
    }

    private fun parseListCard(a: Element, isMovie: Boolean): Show {
        val href = a.attr("href")
        val title = a.selectFirst(".card-title")?.text()?.trim()
            ?: a.selectFirst("img")?.attr("alt")?.trim().orEmpty()
        val poster = a.selectFirst("img")?.attr("src")

        return if (isMovie) {
            Movie(id = href, title = title, poster = poster)
        } else {
            TvShow(id = href, title = title, poster = poster, seasons = listOf(Season(id = href, number = 0)))
        }
    }

    override suspend fun getHome(): List<Category> {
        val document = service.getPage(baseUrl)

        return document.select("section.uniquestream-module").mapNotNull { section ->
            if (section.hasClass("genres-module")) return@mapNotNull null
            val heading = section.selectFirst("h2.module-title")?.text()?.trim().orEmpty()
            if (heading.isEmpty()) return@mapNotNull null
            val items = section.select("article.content-card").mapNotNull { parseHomeCard(it) }
            if (items.isEmpty()) null else Category(name = heading, list = items)
        }
    }

    // the site's own text search sits behind a Cloudflare JS challenge that a plain http client
    // can't clear - browsing by genre/movies/tvshows still works fine, just not free-text search
    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isNotBlank()) return emptyList()

        val document = service.getPage(baseUrl)
        return document.select("a[href*='/genre/']").mapNotNull {
            val href = it.attr("href")
            val genreSlug = href.trimEnd('/').substringAfterLast("/genre/").ifBlank { return@mapNotNull null }
            Genre(id = genreSlug, name = it.text().trim().substringBefore("\n").trim())
        }.distinctBy { it.id }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val url = if (page <= 1) "$baseUrl/movies" else "$baseUrl/movies/page/$page/"
        val document = service.getPage(url)
        return document.select("a.ts-poster-card").map { parseListCard(it, isMovie = true) as Movie }
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val url = if (page <= 1) "$baseUrl/tvshows" else "$baseUrl/tvshows/page/$page/"
        val document = service.getPage(url)
        return document.select("a.ts-poster-card").map { parseListCard(it, isMovie = false) as TvShow }
    }

    private fun overviewOf(document: Document): String? =
        document.selectFirst(".movie-description, .single-movie-description, .description p")?.text()?.trim()

    private fun posterOf(document: Document): String? =
        document.selectFirst(".dp-i-c-poster img, .movie-poster img, article img")?.attr("src")

    override suspend fun getMovie(id: String): Movie {
        val document = service.getPage(id)
        return Movie(
            id = id,
            title = document.selectFirst("h1")?.text()?.trim().orEmpty(),
            overview = overviewOf(document),
            poster = posterOf(document),
            genres = document.select("a[href*='/genre/']").map {
                Genre(id = it.attr("href").trimEnd('/').substringAfterLast("/genre/"), name = it.text().trim())
            }.distinctBy { it.id },
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val document = service.getPage(id)
        return TvShow(
            id = id,
            title = document.selectFirst("h1")?.text()?.trim().orEmpty(),
            overview = overviewOf(document),
            poster = posterOf(document),
            genres = document.select("a[href*='/genre/']").map {
                Genre(id = it.attr("href").trimEnd('/').substringAfterLast("/genre/"), name = it.text().trim())
            }.distinctBy { it.id },
            seasons = document.select(".season-carousel-panel").mapNotNull { panel ->
                val number = panel.attr("data-season-number").toIntOrNull() ?: return@mapNotNull null
                Season(id = "$id::$number", number = number)
            }.ifEmpty { listOf(Season(id = "$id::1", number = 1)) },
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val showUrl = seasonId.substringBeforeLast("::")
        val seasonNumber = seasonId.substringAfterLast("::").toIntOrNull()
        val document = service.getPage(showUrl)

        val panel = document.select(".season-carousel-panel").firstOrNull {
            it.attr("data-season-number").toIntOrNull() == seasonNumber
        } ?: document.selectFirst(".season-carousel-panel")

        return panel?.select("a.ep-card")?.mapIndexed { index, a ->
            val href = a.attr("href")
            Episode(
                id = href,
                number = a.selectFirst(".ep-card-badge")?.text()?.removePrefix("E")?.toIntOrNull() ?: (index + 1),
                title = a.selectFirst(".ep-card-title")?.text()?.trim(),
            )
        } ?: emptyList()
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        val url = if (page <= 1) "$baseUrl/genre/$id/" else "$baseUrl/genre/$id/page/$page/"
        val document = service.getPage(url)
        return Genre(
            id = id,
            name = document.selectFirst("h1")?.text()?.trim() ?: id,
            shows = document.select("a.ts-poster-card").map {
                parseListCard(it, isMovie = it.attr("href").contains("/movies/"))
            },
        )
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("People pages are not supported by UniqueStream")
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val document = service.getPage(id)
        val nonce = Regex(""""nonce":"([^"]+)"""").find(document.outerHtml())?.groupValues?.getOrNull(1)
            ?: throw Exception("UniqueStream nonce not found")

        return document.select(".server-btn[data-post]").mapNotNull {
            val post = it.attr("data-post").ifBlank { return@mapNotNull null }
            val type = it.attr("data-type").ifBlank { return@mapNotNull null }
            val num = it.attr("data-num").ifBlank { "1" }
            val label = it.selectFirst(".server-name")?.text()?.trim().orEmpty().ifEmpty { "Server $num" }
            Video.Server(id = "$post|$type|$num|$nonce", name = label)
        }
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val (post, type, num, nonce) = server.id.split("|").let {
            if (it.size != 4) throw Exception("UniqueStream malformed server id") else it
        }

        val ajaxResponse = service.playerAjax(
            mapOf("action" to "uniquestream_player_ajax", "nonce" to nonce, "post" to post, "type" to type, "nume" to num)
        )
        val iframeSrc = org.jsoup.Jsoup.parse(ajaxResponse.embedUrl.orEmpty()).selectFirst("iframe")?.attr("src")
            ?: throw Exception("UniqueStream embed url not found")

        val embedPage = service.getPage(iframeSrc)
        val manifestTk = Regex("""MANIFEST_TK\s*=\s*"([^"]+)"""").find(embedPage.outerHtml())?.groupValues?.getOrNull(1)
            ?: throw Exception("UniqueStream manifest token not found")

        val embedHttpUrl = iframeSrc.toHttpUrl()
        val manifestUrl = "${embedHttpUrl.scheme}://${embedHttpUrl.host}${embedHttpUrl.encodedPath.trimEnd('/')}/manifest"

        val master = service.manifestPost(manifestUrl, Service.ManifestRequest(tk = manifestTk)).bodyOrMaster.orEmpty()
        if (master.isBlank()) throw Exception("UniqueStream master playlist not found")

        // pick the highest-bandwidth variant the master lists, then resolve it to its real,
        // signed-segment-url playlist text via the same POST the player itself makes
        val variantName = Regex("""BANDWIDTH=(\d+)[^\n]*\n\s*usv2://p/([^\s]+)""")
            .findAll(master)
            .maxByOrNull { it.groupValues[1].toLongOrNull() ?: 0L }
            ?.groupValues?.getOrNull(2)
            ?: throw Exception("UniqueStream no quality variant found")

        val variantBody = service.manifestPost(manifestUrl, Service.ManifestRequest(tk = manifestTk, name = variantName)).bodyOrMaster.orEmpty()
        if (!variantBody.contains("http")) throw Exception("UniqueStream variant playlist empty")

        val dataUrl = "data:application/vnd.apple.mpegurl;base64," +
            Base64.getEncoder().encodeToString(variantBody.toByteArray(Charsets.UTF_8))

        return Video(
            source = dataUrl,
            headers = mapOf(
                "Referer" to iframeSrc,
                "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ),
        )
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
                    .baseUrl("https://uniquestream.net")
                    .client(client)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(Service::class.java)
            }
        }

        @GET
        suspend fun getPage(@Url url: String): Document

        @FormUrlEncoded
        @POST("wp-admin/admin-ajax.php")
        suspend fun playerAjax(@FieldMap fields: Map<String, String>): PlayerAjaxResponse

        @POST
        suspend fun manifestPost(@Url url: String, @Body body: ManifestRequest): ManifestResponse

        data class PlayerAjaxResponse(
            val embed_url: String? = null,
        ) {
            val embedUrl get() = embed_url
        }

        data class ManifestRequest(val tk: String, val name: String? = null)

        data class ManifestResponse(
            val master: String? = null,
            val body: String? = null,
        ) {
            val bodyOrMaster get() = body ?: master
        }
    }
}
