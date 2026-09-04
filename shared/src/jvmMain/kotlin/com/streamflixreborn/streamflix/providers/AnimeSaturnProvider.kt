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
import com.streamflixreborn.streamflix.utils.UserPreferences
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
import retrofit2.http.Header
import retrofit2.http.Headers
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Url
import java.net.URI
import java.util.Base64
import java.util.concurrent.TimeUnit

// rebuilt from scratch 2026-09 after the site moved to a new domain (animesaturn.ro) on a
// completely different wordpress theme - none of the old css selectors survived the move,
// this targets the new "bs"/"bsx"/"infox"/"eplister" theme markup instead.
//
// animesaturn.ro isn't actually on the brand's own official-domains list (animesaturn.me) -
// the real site moved on to animesaturn.net with a whole different modern theme. .ro is kept
// as the primary source since it's the interface the user actually recognizes/trusts, with
// .net as an automatic fallback if .ro ever goes down, and a third fallback that re-reads
// animesaturn.me's own domain list and retries the .net-style scrape against whatever domain
// it lists, in case .net itself gets replaced the same way .cx/.cc/.com were
object AnimeSaturnProvider : Provider {
    override val name = "AnimeSaturn"
    override val baseUrl = "https://animesaturn.ro"

    override val logo = "https://animesaturn.ro/wp-content/uploads/2026/04/favicon.png"
    override val language = "it"

    private const val USER_AGENT = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    // ===================== tier 1: animesaturn.ro (wordpress "bs/bsx" theme) =====================

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

    private suspend fun roGetHome(): List<Category> {
        val sections = listOf(
            "In aggiornamento" to "update",
            "Popolari" to "popular",
            "Aggiunti di recente" to "latest",
        )
        return sections.mapNotNull { (title, order) ->
            val shows = fetchCards(1) { sitePage -> service.getAnimeListPage(sitePage, order) }
            if (shows.isEmpty()) null else Category(title, shows)
        }
    }

    private suspend fun roGetGenre(id: String, page: Int): Genre {
        val shows = fetchCards(page) { sitePage -> service.getGenrePage(id, sitePage) }
        val name = id.split("-").joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
        return Genre(id = id, name = name, shows = shows)
    }

    private suspend fun roGetTvShows(page: Int): List<TvShow> =
        fetchCards(page) { sitePage -> service.getAnimeListPage(sitePage, "latest") }

    // "<b>Label:</b> value" pairs in .infox .spe span, e.g. "<b>Stato:</b> Ongoing"
    private fun infoValue(document: Document, label: String): String? =
        document.select(".infox .spe span").find { it.selectFirst("b")?.text()?.trim()?.trimEnd(':') == label }
            ?.ownText()?.trim()?.takeIf { it.isNotEmpty() }

    private suspend fun roGetTvShow(id: String): TvShow {
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

        if (title.isEmpty()) throw Exception("empty title")

        return TvShow(
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
    }

    private fun parseEpisodeItem(element: Element): Episode? {
        val link = element.selectFirst("a") ?: return null
        val number = element.selectFirst(".epl-num")?.text()?.trim()?.toIntOrNull() ?: return null
        val title = element.selectFirst(".epl-title")?.text()?.trim().takeUnless { it.isNullOrEmpty() } ?: link.attr("title")
        return Episode(id = link.attr("href"), number = number, title = title)
    }

    private suspend fun roGetEpisodes(seasonId: String): List<Episode> = coroutineScope {
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

    private suspend fun roGetServers(id: String): List<Video.Server> {
        val document = service.getByUrl(id)
        return document.select(".server-button").mapIndexedNotNull { index, button ->
            val onclick = button.attr("onclick")
            val base64 = Regex("""value:\s*'([^']+)'""").find(onclick)?.groupValues?.get(1) ?: return@mapIndexedNotNull null
            val iframeHtml = String(Base64.getDecoder().decode(base64))
            val playerUrl = Regex("""src="([^"]+)"""").find(iframeHtml)?.groupValues?.get(1)?.replace("&#038;", "&") ?: return@mapIndexedNotNull null
            val serverName = button.text().trim().ifEmpty { "Server ${index + 1}" }
            Video.Server(id = playerUrl, name = serverName)
        }
    }

    private suspend fun roGetVideo(playerUrl: String): Video {
        val response = service.getPlayerPage(playerUrl).string()
        val src = Regex("""var src\s*=\s*"([^"]+)"""").find(response)?.groupValues?.get(1)?.replace("\\u0026", "&")
            ?: return Video(source = "")
        return Video(source = src)
    }

    // ===================== tier 2: animesaturn.net (current official site, modern theme) =====================

    private const val NET_DOMAIN = "https://www.animesaturn.net"

    private interface SaturnNetService {
        companion object {
            fun build(): SaturnNetService {
                val client = OkHttpClient.Builder()
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .dns(DnsResolver.doh)
                    .build()
                return Retrofit.Builder()
                    .baseUrl("$NET_DOMAIN/")
                    .addConverterFactory(JsoupConverterFactory.create())
                    .client(client)
                    .build()
                    .create(SaturnNetService::class.java)
            }
        }

        // every method takes a full url so the same client also serves tier 3's discovered domain
        @Headers(USER_AGENT)
        @GET
        suspend fun getDocument(@Url url: String): Document

        @Headers(USER_AGENT)
        @GET
        suspend fun getRaw(@Url url: String): ResponseBody

        // the playlist endpoint 403s without a referer matching the embed page it's called from
        @Headers(USER_AGENT)
        @GET
        suspend fun getRawWithReferer(@Url url: String, @Header("Referer") referer: String): ResponseBody
    }

    private val netService = SaturnNetService.build()

    // our own genre ids (shared with the ro tier's /genres/{slug}/ scheme, see custom-home-sections.ts)
    // mapped to .net's numeric category ids from its /filter checkboxes
    private val NET_GENRE_IDS = mapOf(
        "isekai" to "49", "shounen" to "32", "seinen" to "29", "mecha" to "18",
        "harem" to "11", "psicologico" to "24", "soprannaturale" to "37", "slice-of-life" to "34",
    )

    private fun netParseCard(element: Element): TvShow? {
        val href = element.attr("href")
        if (href.isEmpty()) return null
        val animeHref = if (href.startsWith("/episode/")) href.substringBefore("/ep-").replaceFirst("/episode/", "/anime/") else href
        if (!animeHref.startsWith("/anime/")) return null
        val title = element.selectFirst(".ac__title")?.text()?.trim() ?: return null
        val poster = element.selectFirst("img")?.attr("src") ?: ""
        return TvShow(id = animeHref.removePrefix("/anime/").trim('/'), title = title, poster = poster)
    }

    private fun netParseRssItems(rss: String): List<TvShow> {
        return Regex("<item>(.*?)</item>", RegexOption.DOT_MATCHES_ALL).findAll(rss).mapNotNull { m ->
            val block = m.groupValues[1]
            val link = Regex("<link>([^<]+)</link>").find(block)?.groupValues?.get(1) ?: return@mapNotNull null
            val title = Regex("<title>([^<]+)</title>").find(block)?.groupValues?.get(1) ?: return@mapNotNull null
            val poster = Regex("""<media:thumbnail url="([^"]+)"""").find(block)?.groupValues?.get(1)
            if (!link.contains("/anime/")) return@mapNotNull null
            TvShow(id = link.substringAfter("/anime/").trim('/'), title = title, poster = poster)
        }.distinctBy { it.id }.toList()
    }

    private suspend fun netGetHome(domain: String = NET_DOMAIN): List<Category> = coroutineScope {
        val rssDeferred = async { runCatching { netService.getRaw("$domain/rss/anime").string() }.getOrNull() }
        val homeDeferred = async { runCatching { netService.getDocument("$domain/") }.getOrNull() }

        val categories = mutableListOf<Category>()
        rssDeferred.await()?.let { rss ->
            val items = netParseRssItems(rss)
            if (items.isNotEmpty()) categories.add(Category("Nuove aggiunte", items))
        }
        homeDeferred.await()?.let { doc ->
            val cards = doc.select("a.ac.group").mapNotNull { netParseCard(it) }.distinctBy { it.id }
            if (cards.isNotEmpty()) categories.add(Category("In evidenza", cards))
        }
        categories
    }

    private suspend fun netGetGenre(id: String, page: Int, domain: String = NET_DOMAIN): Genre {
        val categoryId = NET_GENRE_IDS[id] ?: id
        val url = "$domain/filter?categories%5B%5D=$categoryId&page=$page"
        val shows = netService.getDocument(url).select("a.ac.group").mapNotNull { netParseCard(it) }
        val name = id.split("-").joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
        return Genre(id = id, name = name, shows = shows)
    }

    private suspend fun netGetTvShow(id: String, domain: String = NET_DOMAIN): TvShow {
        val document = netService.getDocument("$domain/anime/$id")
        val title = document.selectFirst("h1.font-display")?.text()?.trim() ?: ""
        if (title.isEmpty()) throw Exception("empty title")
        val poster = document.selectFirst(".ag-poster img")?.attr("src") ?: ""
        val overview = document.selectFirst(".ag-story .story-clip")?.text()?.trim() ?: ""
        val genres = document.select(".ag-genres a").map { Genre(id = it.text().trim(), name = it.text().trim()) }

        return TvShow(
            id = id,
            title = title,
            poster = poster,
            overview = overview,
            genres = genres,
            seasons = listOf(Season(id = id, number = 1, title = "Episodi")),
        )
    }

    private suspend fun netGetEpisodes(id: String, domain: String = NET_DOMAIN): List<Episode> {
        val document = netService.getDocument("$domain/anime/$id")
        return document.select("a.ep-tile").mapNotNull { el ->
            val href = el.attr("href").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val number = el.ownText().trim().toIntOrNull() ?: return@mapNotNull null
            Episode(id = href, number = number, title = el.attr("title").ifEmpty { "Episodio $number" })
        }.sortedBy { it.number }
    }

    // the watch page hands its whole initial state (servers included) to alpine.js as one
    // html-encoded json blob in x-data="watchPage({...})" - cheaper to pull that out with a
    // couple of regexes than to add a json dependency just for this one shape
    private suspend fun netGetServers(episodeUrl: String, domain: String = NET_DOMAIN): List<Video.Server> {
        // episode ids point at the seo landing page (/episode/{id}/ep-N) - the actual player
        // with server data lives at the anime watch page instead (/anime/{id}/ep-N)
        val watchPath = episodeUrl.replaceFirst("/episode/", "/anime/")
        val url = if (watchPath.startsWith("http")) watchPath else "$domain$watchPath"
        val document = netService.getDocument(url)
        val watchData = document.select("[x-data*=watchPage]").attr("x-data")
        if (watchData.isEmpty()) return emptyList()
        val json = watchData.substringAfter("watchPage(", "").substringBeforeLast(")")
            .replace("&quot;", "\"").replace("\\/", "/").replace("\\u0026", "&")
        val serversBlock = json.substringAfter("\"servers\":[", "").substringBefore("],\"currentServer\"", "")
        return Regex("""\{[^}]*\}""").findAll(serversBlock).mapNotNull { m ->
            val obj = m.value
            val link = Regex(""""link":"([^"]*)"""").find(obj)?.groupValues?.get(1)?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val serverName = Regex(""""name":"([^"]*)"""").find(obj)?.groupValues?.get(1) ?: "Server"
            Video.Server(id = "netembed:$link", name = serverName)
        }.toList()
    }

    private fun xorDecode(base64: String, key: String): String {
        val bytes = Base64.getDecoder().decode(base64)
        val out = StringBuilder(bytes.size)
        for (i in bytes.indices) {
            out.append((bytes[i].toInt() and 0xFF xor key[i % key.length].code).toChar())
        }
        return out.toString()
    }

    private suspend fun netGetVideo(embedUrl: String): Video {
        val uri = URI(embedUrl)
        val episodeId = uri.path.trimEnd('/').substringAfterLast("/")
        val params = uri.query.orEmpty().split("&").mapNotNull {
            val parts = it.split("=", limit = 2)
            if (parts.size == 2) parts[0] to parts[1] else null
        }.toMap()
        val token = params["token"] ?: return Video(source = "")
        val expires = params["expires"].orEmpty()
        val playlistHost = "${uri.scheme}://${uri.host}"
        val playlistUrl = "$playlistHost/embed/$episodeId/playlist?token=$token&expires=$expires"
        val body = netService.getRawWithReferer(playlistUrl, "$playlistHost/embed/$episodeId").string()
        val encoded = Regex(""""d":"([^"]*)"""").find(body)?.groupValues?.get(1) ?: return Video(source = "")
        if (encoded.isEmpty()) return Video(source = "")
        return Video(source = xorDecode(encoded, token))
    }

    // ===================== tier 3: re-discover the current domain from animesaturn.me =====================

    private const val CACHE_KEY_TIER3_DOMAIN = "tier3_domain"

    // cached on disk (UserPreferences, same mechanism other providers use for their own
    // domain-migration caches) so a working tier 3 domain survives restarts and doesn't need
    // to re-fetch animesaturn.me on every single call - only re-fetched once that cached
    // domain itself stops working (see withTier3Fallback)
    private fun cachedTier3Domain(): String? =
        UserPreferences.getProviderCache(this, CACHE_KEY_TIER3_DOMAIN).ifEmpty { null }

    private fun cacheTier3Domain(domain: String) {
        UserPreferences.setProviderCache(this, CACHE_KEY_TIER3_DOMAIN, domain)
    }

    private suspend fun rediscoverTier3Domain(): String? {
        val discovered = runCatching {
            val document = netService.getDocument("https://www.animesaturn.me/")
            document.select(".intro a[href]")
                .map { it.attr("href").trimEnd('/') }
                .firstOrNull { it.contains("animesaturn") && !it.contains("animesaturn.ro") && !it.contains("animesaturn.net") }
        }.getOrNull()
        if (discovered != null) cacheTier3Domain(discovered)
        return discovered
    }

    // tries the cached tier 3 domain first (no animesaturn.me fetch at all if it still works);
    // only goes back to animesaturn.me for a fresh domain once the cached one stops resolving
    private suspend fun <T> withTier3Fallback(empty: T, isEmpty: (T) -> Boolean, attempt: suspend (String) -> T): T {
        val cached = cachedTier3Domain()
        if (cached != null) {
            runCatching { attempt(cached) }.getOrNull()?.takeIf { !isEmpty(it) }?.let { return it }
        }
        val fresh = rediscoverTier3Domain() ?: return empty
        if (fresh == cached) return empty // .me hasn't listed anything new either, nothing left to try
        return runCatching { attempt(fresh) }.getOrNull() ?: empty
    }

    // ===================== dispatch: ro -> net -> rediscovered domain =====================

    override suspend fun getHome(): List<Category> {
        runCatching { roGetHome() }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
        runCatching { netGetHome() }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
        return withTier3Fallback(emptyList(), { it.isEmpty() }) { domain -> netGetHome(domain) }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) return emptyList()
        return try {
            val document = if (page > 1) service.searchPage(page, query) else service.search(query)
            document.select(".bs").mapNotNull { parseCard(it) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        runCatching { roGetGenre(id, page) }.getOrNull()?.takeIf { it.shows.isNotEmpty() }?.let { return it }
        runCatching { netGetGenre(id, page) }.getOrNull()?.takeIf { it.shows.isNotEmpty() }?.let { return it }
        val empty = Genre(id = id, name = id, shows = emptyList())
        return withTier3Fallback(empty, { it.shows.isEmpty() }) { domain -> netGetGenre(id, page, domain) }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        return emptyList() // AnimeSaturn is TV shows only
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        return runCatching { roGetTvShows(page) }.getOrNull()?.takeIf { it.isNotEmpty() } ?: emptyList()
    }

    override suspend fun getTvShow(id: String): TvShow {
        runCatching { roGetTvShow(id) }.getOrNull()?.let { return it }
        runCatching { netGetTvShow(id) }.getOrNull()?.let { return it }
        val empty = TvShow(id = id, title = "", poster = "")
        return withTier3Fallback(empty, { it.title.isEmpty() }) { domain -> netGetTvShow(id, domain) }
    }

    override suspend fun getMovie(id: String): Movie {
        throw Exception("Movies not supported")
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        runCatching { roGetEpisodes(seasonId) }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
        runCatching { netGetEpisodes(seasonId) }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
        return withTier3Fallback(emptyList(), { it.isEmpty() }) { domain -> netGetEpisodes(seasonId, domain) }
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        // .ro episode ids are full urls into animesaturn.ro, .net's are site-relative paths -
        // easy enough to tell apart without needing to know which tier resolved the season
        return if (id.startsWith("http")) {
            runCatching { roGetServers(id) }.getOrNull()?.takeIf { it.isNotEmpty() } ?: emptyList()
        } else {
            runCatching { netGetServers(id) }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { return it }
            withTier3Fallback(emptyList(), { it.isEmpty() }) { domain -> netGetServers(id, domain) }
        }
    }

    override suspend fun getPeople(id: String, page: Int): People {
        return People(id = id, name = id)
    }

    override suspend fun getVideo(server: Video.Server): Video {
        return try {
            if (server.id.startsWith("netembed:")) {
                netGetVideo(server.id.removePrefix("netembed:"))
            } else {
                roGetVideo(server.id)
            }
        } catch (e: Exception) {
            Video(source = "")
        }
    }
}
