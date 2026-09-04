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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Url
import java.util.Base64
import java.util.concurrent.TimeUnit

// rebuilt from scratch 2026-09 after the site moved to a new domain (animesaturn.ro) on a
// completely different wordpress theme - none of the old css selectors survived the move,
// this targets the new "bs"/"bsx"/"infox"/"eplister" theme markup instead
object AnimeSaturnProvider : Provider {
    override val name = "AnimeSaturn"
    override val baseUrl = "https://animesaturn.ro"

    override val logo = "https://animesaturn.ro/wp-content/uploads/2026/04/favicon.png"
    override val language = "it"

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    private interface AnimeSaturnService {
        companion object {
            fun build(baseUrl: String): AnimeSaturnService {
                val client = OkHttpClient.Builder()
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .dns(DnsResolver.doh)
                    .build()

                return Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(AnimeSaturnService::class.java)
            }
        }

        // wordpress redirects page/1/ to the plain archive url, no need for a separate
        // "page 1" endpoint - the client follows redirects automatically
        @Headers(USER_AGENT)
        @GET("anime/page/{page}/")
        suspend fun getAnimeListPage(@Path("page") page: Int, @Query("order") order: String? = null): Document

        @Headers(USER_AGENT)
        @GET("genres/{id}/page/{page}/")
        suspend fun getGenrePage(@Path("id") id: String, @Path("page") page: Int): Document

        @Headers(USER_AGENT)
        @GET("anime/{id}/")
        suspend fun getAnime(@Path("id") id: String): Document

        @Headers(USER_AGENT)
        @GET
        suspend fun getByUrl(@Url url: String): Document

        @Headers(USER_AGENT)
        @GET("/")
        suspend fun search(@Query("s") query: String): Document

        @Headers(USER_AGENT)
        @GET("page/{page}/")
        suspend fun searchPage(@Path("page") page: Int, @Query("s") query: String): Document

        @Headers(USER_AGENT)
        @FormUrlEncoded
        @POST("wp-admin/admin-ajax.php")
        suspend fun loadEpisodeChunk(
            @Field("action") action: String = "miruro_load_eplchunk",
            @Field("nonce") nonce: String,
            @Field("series") series: String,
            @Field("page") page: Int,
        ): ResponseBody

        @Headers(USER_AGENT)
        @GET
        suspend fun getPlayerPage(@Url url: String): ResponseBody
    }

    private val service = AnimeSaturnService.build(baseUrl)

    // the theme only shows 10 cards per page - barely fills a row, nothing left to scroll to.
    // fetch a few of the site's own pages in parallel and merge them into one richer page of ours
    private const val PAGE_MULTIPLIER = 4

    private fun idFromAnimeUrl(url: String): String = url.trimEnd('/').substringAfterLast("/anime/")

    private fun parseCard(element: Element): TvShow? {
        val link = element.selectFirst("a[itemprop=url]") ?: return null
        val href = link.attr("href")
        if (!href.contains("/anime/")) return null
        val title = link.attr("title").trim().ifEmpty { element.selectFirst(".tt")?.ownText()?.trim() ?: "" }
        val poster = element.selectFirst("img")?.attr("src") ?: ""
        return TvShow(id = idFromAnimeUrl(href), title = title, poster = poster)
    }

    private suspend fun fetchCards(page: Int, fetchSitePage: suspend (Int) -> Document): List<TvShow> = coroutineScope {
        val firstSitePage = (page - 1) * PAGE_MULTIPLIER + 1
        val documents = (firstSitePage until firstSitePage + PAGE_MULTIPLIER)
            .map { sitePage -> async { runCatching { fetchSitePage(sitePage) }.getOrNull() } }
            .awaitAll()
        documents.filterNotNull()
            .flatMap { it.select(".bs").mapNotNull { el -> parseCard(el) } }
            .distinctBy { it.id }
    }

    override suspend fun getHome(): List<Category> {
        return try {
            val sections = listOf(
                "In aggiornamento" to "update",
                "Popolari" to "popular",
                "Aggiunti di recente" to "latest",
            )
            sections.mapNotNull { (title, order) ->
                val shows = fetchCards(1) { sitePage -> service.getAnimeListPage(sitePage, order) }
                if (shows.isEmpty()) null else Category(title, shows)
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        return try {
            if (query.isBlank()) return emptyList()
            val document = if (page > 1) service.searchPage(page, query) else service.search(query)
            document.select(".bs").mapNotNull { parseCard(it) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        return try {
            val shows = fetchCards(page) { sitePage -> service.getGenrePage(id, sitePage) }
            val name = id.split("-").joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
            Genre(id = id, name = name, shows = shows)
        } catch (e: Exception) {
            Genre(id = id, name = id, shows = emptyList())
        }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        return emptyList() // AnimeSaturn is TV shows only
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        return try {
            fetchCards(page) { sitePage -> service.getAnimeListPage(sitePage, "latest") }
        } catch (e: Exception) {
            emptyList()
        }
    }

    // "<b>Label:</b> value" pairs in .infox .spe span, e.g. "<b>Stato:</b> Ongoing"
    private fun infoValue(document: Document, label: String): String? =
        document.select(".infox .spe span").find { it.selectFirst("b")?.text()?.trim()?.trimEnd(':') == label }
            ?.ownText()?.trim()?.takeIf { it.isNotEmpty() }

    override suspend fun getTvShow(id: String): TvShow {
        return try {
            val document = service.getAnime(id)

            val title = document.selectFirst(".infox h1.entry-title")?.text()?.trim() ?: ""
            val poster = document.selectFirst(".thumbook .thumb img")?.attr("src") ?: ""
            val overview = document.selectFirst(".infox .desc")?.text()?.trim() ?: ""
            val trailer = document.selectFirst("a.trailerbutton")?.attr("href")

            val released = infoValue(document, "Uscita")
                ?.split(" ")
                ?.find { it.length == 4 && it.all(Char::isDigit) }
                ?: ""
            val runtime = infoValue(document, "Durata")?.substringBefore(" ")?.toIntOrNull()

            val genres = document.select(".infox .genxed a").map { Genre(id = it.text().trim(), name = it.text().trim()) }

            val recommendations = document.select("#gallery .bs, .relates .bs").mapNotNull { parseCard(it) }

            TvShow(
                id = id,
                title = title,
                poster = poster,
                overview = overview,
                trailer = trailer,
                released = released,
                runtime = runtime,
                genres = genres,
                seasons = listOf(Season(id = id, number = 1, title = "Episodi")),
                recommendations = recommendations,
            )
        } catch (e: Exception) {
            TvShow(id = id, title = "", poster = "")
        }
    }

    override suspend fun getMovie(id: String): Movie {
        throw Exception("Movies not supported")
    }

    private fun parseEpisodeItem(element: Element): Episode? {
        val link = element.selectFirst("a") ?: return null
        val number = element.selectFirst(".epl-num")?.text()?.trim()?.toIntOrNull() ?: return null
        val title = element.selectFirst(".epl-title")?.text()?.trim().takeUnless { it.isNullOrEmpty() } ?: link.attr("title")
        return Episode(id = link.attr("href"), number = number, title = title)
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> = coroutineScope {
        try {
            val document = service.getAnime(seasonId)
            val episodes = mutableListOf<Episode>()

            episodes += document.select(".eplister .ep-page[data-eppage=0] li").mapNotNull { parseEpisodeItem(it) }

            val episodesBox = document.selectFirst("#episodes.epcheck")
            val seriesId = episodesBox?.attr("data-series")?.takeIf { it.isNotEmpty() }
            val totalPages = episodesBox?.attr("data-pages")?.toIntOrNull() ?: 1
            val nonce = document.toString().substringAfter("var nonce", "").substringAfter("'", "").substringBefore("'", "")

            if (seriesId != null && nonce.isNotEmpty() && totalPages > 1) {
                val chunks = (1 until totalPages).map { chunkPage ->
                    async { loadChunkWithRetry(nonce, seriesId, chunkPage) }
                }.awaitAll()
                chunks.forEach { html ->
                    if (html != null) {
                        episodes += Jsoup.parseBodyFragment(html).select("li").mapNotNull { parseEpisodeItem(it) }
                    }
                }
            }

            episodes.sortedBy { it.number }
        } catch (e: Exception) {
            emptyList()
        }
    }

    // the chunk endpoint answers "busy, retry" under load, same as the site's own player js does
    private suspend fun loadChunkWithRetry(nonce: String, series: String, page: Int): String? {
        repeat(3) { attempt ->
            try {
                val body = service.loadEpisodeChunk(nonce = nonce, series = series, page = page).string()
                val html = body.substringAfter("\"html\":\"", "").substringBeforeLast("\"}}")
                if (html.isNotEmpty()) {
                    return html.replace("\\/", "/").replace("\\\"", "\"")
                }
            } catch (e: Exception) {
                // fall through to retry
            }
            if (attempt < 2) delay(1500)
        }
        return null
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        return try {
            val document = service.getByUrl(id)

            document.select(".server-button").mapIndexedNotNull { index, button ->
                val onclick = button.attr("onclick")
                val base64 = Regex("""value:\s*'([^']+)'""").find(onclick)?.groupValues?.get(1) ?: return@mapIndexedNotNull null
                val iframeHtml = String(Base64.getDecoder().decode(base64))
                val playerUrl = Regex("""src="([^"]+)"""").find(iframeHtml)?.groupValues?.get(1)?.replace("&#038;", "&") ?: return@mapIndexedNotNull null
                val serverName = button.text().trim().ifEmpty { "Server ${index + 1}" }
                Video.Server(id = playerUrl, name = serverName)
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getPeople(id: String, page: Int): People {
        return People(id = id, name = id)
    }

    override suspend fun getVideo(server: Video.Server): Video {
        return try {
            val response = service.getPlayerPage(server.id).string()
            val src = Regex("""var src\s*=\s*"([^"]+)"""").find(response)?.groupValues?.get(1)?.replace("\\u0026", "&")
                ?: return Video(source = "")
            Video(source = src)
        } catch (e: Exception) {
            Video(source = "")
        }
    }
}
