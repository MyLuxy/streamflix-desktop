package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

import com.streamflixreborn.streamflix.utils.Base64

import com.streamflixreborn.streamflix.utils.Log

import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.*
import com.streamflixreborn.streamflix.utils.JsUnpacker
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import retrofit2.Retrofit
import retrofit2.converter.scalars.ScalarsConverterFactory
import retrofit2.http.GET
import retrofit2.http.Url
import java.util.concurrent.TimeUnit

object PelotaLibreTvHdProvider : IptvProvider {
    override val name = "Pelota Libre TV"
    // pelotalibretvhd.live is dead (NXDOMAIN); this is the closest live successor - same
    // eventos.html?r=<base64 streamtp url> agenda scheme our getServers/getVideo already handle
    override val baseUrl = "https://pelotalibretv2.online"
    override val logo = "https://i.ibb.co/qYgyrsYS/Pelota-Libre.jpg"
    override val language = "es"

    private const val TAG = "PelotaLibre"
    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .cookieJar(object : CookieJar {
            private val cookieStore = HashMap<String, MutableList<Cookie>>()
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                cookieStore[url.host] = cookies.toMutableList()
            }
            override fun loadForRequest(url: HttpUrl): List<Cookie> {
                return cookieStore[url.host] ?: ArrayList()
            }
        })
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .header("User-Agent", USER_AGENT)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
                .header("Accept-Language", "es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3")
                .build()
            chain.proceed(request)
        }
        .build()

    private interface ApiService {
        @GET
        suspend fun getHtml(@Url url: String): Document

        @GET
        suspend fun getText(@Url url: String): String
    }

    private val api = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(JsoupConverterFactory.create())
        .addConverterFactory(ScalarsConverterFactory.create())
        .build()
        .create(ApiService::class.java)

    private data class StreamConfig(val activeDomain: String, val basePath: String)

    // the site itself only reads this from a small JS file at runtime (config.js), so fetching
    // it dynamically instead of hardcoding the CDN domain survives that domain rotating on its
    // own, same as the site's real player does
    private var cachedStreamConfig: StreamConfig? = null
    private var streamConfigFetchedAt = 0L

    private suspend fun getStreamConfig(): StreamConfig {
        val fallback = StreamConfig("streamtp99a.sbs", "/global1.php?stream=")
        val now = System.currentTimeMillis()
        cachedStreamConfig?.let { if (now - streamConfigFetchedAt < 10 * 60 * 1000) return it }
        return try {
            val text = api.getText("$baseUrl/config.js")
            val domain = Regex("""activeDomain\s*:\s*["']([^"']+)["']""").find(text)?.groupValues?.getOrNull(1) ?: fallback.activeDomain
            val path = Regex("""basePath\s*:\s*["']([^"']+)["']""").find(text)?.groupValues?.getOrNull(1) ?: fallback.basePath
            StreamConfig(domain, path).also {
                cachedStreamConfig = it
                streamConfigFetchedAt = now
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error obteniendo config.js: ${e.message}")
            fallback
        }
    }

    private suspend fun fetchChannels(): List<TvShow> {
        val channels = mutableListOf<TvShow>()
        try {
            val doc = api.getHtml(baseUrl)
            val channelElements = doc.select("section#canales a[href*='canal.html']")

            for (aTag in channelElements) {
                val href = aTag.attr("href")
                val img = aTag.selectFirst("img") ?: continue

                val posterUrl = img.attr("src").ifEmpty { img.attr("data-src") }
                val title = img.attr("alt").takeIf { it.isNotEmpty() }?.removePrefix("Logo ")?.trim() ?: "Canal en Vivo"

                if (href.isNotEmpty() && posterUrl.isNotEmpty() && !href.contains("javascript")) {
                    val url = if (href.startsWith("http")) href else "$baseUrl/${href.removePrefix("/")}"
                    val posterFinal = if (posterUrl.startsWith("http")) posterUrl else "$baseUrl/${posterUrl.removePrefix("/")}"

                    channels.add(TvShow(
                        id = url,
                        title = title,
                        poster = posterFinal,
                        banner = posterFinal
                    ))
                }
            }
        } catch (e: Exception) { Log.e(TAG, "Error parseando Canales: ${e.message}") }
        return channels
    }

    // the agenda is rendered client-side from a JS array in eventos.js, not present in the
    // static homepage html at all - fetch and parse that array directly instead
    private suspend fun fetchAgenda(): List<TvShow> {
        val matches = mutableListOf<TvShow>()
        try {
            val raw = api.getText("$baseUrl/eventos.js")
            val jsonText = raw.substringAfter("=").trim().removeSuffix(";").trim()
            val eventos = JSONArray(jsonText)

            for (i in 0 until eventos.length()) {
                val evento = eventos.getJSONObject(i)
                val titulo = evento.optString("titulo")
                val hora = evento.optString("hora")
                val canales = evento.optJSONArray("canales") ?: continue

                for (j in 0 until canales.length()) {
                    val canal = canales.getJSONObject(j)
                    val nombre = canal.optString("nombre")
                    val calidad = canal.optString("calidad")
                    val relUrl = canal.optString("url")
                    if (relUrl.isBlank()) continue

                    val channelLabel = if (calidad.isNotEmpty()) "$nombre ($calidad)" else nombre
                    val displayTitle = if (hora.isNotEmpty()) "[$hora] $titulo - $channelLabel" else "$titulo - $channelLabel"
                    val url = if (relUrl.startsWith("http")) relUrl else "$baseUrl/${relUrl.removePrefix("/")}"

                    matches.add(TvShow(
                        id = url,
                        title = displayTitle,
                        poster = logo,
                        banner = logo
                    ))
                }
            }
        } catch (e: Exception) { Log.e(TAG, "Error parseando Agenda: ${e.message}") }
        return matches
    }

    override suspend fun getHome(): List<Category> = coroutineScope {
        val categories = mutableListOf<Category>()

        try {
            val channelsDeferred = async { try { fetchChannels() } catch(e:Exception) { emptyList<TvShow>() } }
            val agendaDeferred = async { try { fetchAgenda() } catch(e:Exception) { emptyList<TvShow>() } }

            val matches = agendaDeferred.await()
            val channels = channelsDeferred.await()

            if (matches.isNotEmpty()) {
                categories.add(Category(name = "Agenda Deportiva", list = matches))
            }
            if (channels.isNotEmpty()) {
                categories.add(Category(name = "Canales 24/7", list = channels))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error crítico al cargar getHome: ${e.message}")
        }

        return@coroutineScope categories
    }

    override suspend fun getTvShows(page: Int): List<TvShow> = coroutineScope {
        if (page == 1) {
            val agendaDeferred = async { try { fetchAgenda() } catch(e:Exception) { emptyList<TvShow>() } }
            val channelsDeferred = async { try { fetchChannels() } catch(e:Exception) { emptyList<TvShow>() } }

            channelsDeferred.await() + agendaDeferred.await()
        } else {
            emptyList()
        }
    }

    override suspend fun getMovies(page: Int): List<Movie> = emptyList()

    override suspend fun search(query: String, page: Int): List<ListItem> = emptyList()

    override suspend fun getGenre(id: String, page: Int): Genre = Genre(id = id, name = id, shows = emptyList())
    override suspend fun getPeople(
        id: String,
        page: Int
    ): People {
        TODO("Not yet implemented")
    }

    override suspend fun getMovie(id: String): Movie = throw NotImplementedError()

    override suspend fun getTvShow(id: String): TvShow {
        val nameGuess = try {
            val url = id.toHttpUrl()
            val canalParam = url.queryParameter("canal")
            if (!canalParam.isNullOrBlank()) canalParam.replace("-", " ").uppercase()
            else url.pathSegments.last().removeSuffix(".html").replace("-", " ").uppercase()
        } catch(e:Exception) { "Canal 24/7" }
        return TvShow(
            id = id,
            title = nameGuess,
            overview = "Disfruta de la transmisión ininterrumpida. Si la reproducción falla, intenta con otra opción.",
            poster = logo,
            banner = logo,
            seasons = listOf(Season(id = id, title = "Transmisión", number = 1))
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        return listOf(
            Episode(
                id = seasonId,
                title = "Ver Transmisión",
                number = 1,
                poster = logo
            )
        )
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val servers = mutableListOf<Video.Server>()

        if (id.contains("eventos.html?r=")) {
            try {
                val encodedParam = id.substringAfter("r=").substringBefore("&")
                val decodedUrl = String(Base64.decode(encodedParam, Base64.DEFAULT))
                servers.add(Video.Server(id = decodedUrl, name = "Reproductor Agenda"))
                return servers
            } catch(e: Exception) { Log.e(TAG, "Error decodificando atajo: ${e.message}") }
        }

        // 24/7 channel pages (canal.html?canal=X) only build their iframe client-side from
        // config.js, there's nothing to scrape in the static html - build the real stream url
        // the same way the page's own script does
        if (id.contains("canal.html?canal=")) {
            val canalId = id.substringAfter("canal=").substringBefore("&")
            if (canalId.isNotEmpty()) {
                val config = getStreamConfig()
                servers.add(Video.Server(id = "https://${config.activeDomain}${config.basePath}$canalId", name = "Reproductor Directo"))
                return servers
            }
        }

        if (id.contains("latamplay") || id.contains("streamtpday") || id.contains("streamx741") || id.contains("zonalive.click")) {
            servers.add(Video.Server(id = id, name = "Reproductor Directo"))
            return servers
        }

        try {
            val doc = api.getHtml(id)
            val iframeSrc = doc.selectFirst("iframe#embedIframe, .preframe iframe, .subiframe iframe")?.attr("src")

            if (!iframeSrc.isNullOrEmpty()) {
                val url = if (iframeSrc.startsWith("http")) iframeSrc
                else if (iframeSrc.startsWith("//")) "https:$iframeSrc"
                else "$baseUrl/${iframeSrc.removePrefix("/")}"

                servers.add(Video.Server(id = url, name = "Reproductor Principal"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error al obtener servidor: ${e.message}")
        }

        return servers
    }

    override suspend fun getVideo(server: Video.Server): Video {
        var currentUrl = server.id
        var currentReferer = baseUrl
        val maxDepth = 10
        var depth = 0

        // these urls are known decoys, not real streams
        val isDecoy: (String) -> Boolean = { link ->
            link.contains("amagi.tv") || link.contains("lovetvchannels") ||
                    link.contains("channel02secure") || link.contains("redirect=true") ||
                    link.contains("grupoz.cl") || link.contains("retroplus") ||
                    link.contains("frequency.stream")
        }

        while (depth < maxDepth) {
            depth++
            try {
                if (currentUrl.contains("latamplay") && currentUrl.contains("/channel/")) {
                    val streamName = currentUrl.substringAfter("channel/").substringBefore("?").removeSuffix(".php")
                    currentReferer = currentUrl
                    currentUrl = "https://streamtpday1.xyz/global1.php?stream=$streamName"
                    continue
                }

                val request = Request.Builder()
                    .url(currentUrl)
                    .header("Referer", currentReferer)
                    .build()

                val response = client.newCall(request).execute()
                val htmlCrudo = response.body?.string() ?: ""
                val cleanHtml = htmlCrudo.replace("\\/", "/")
                var htmlParaAnalizar = cleanHtml

                val currentUri = try { currentUrl.toHttpUrl() } catch (e: Exception) { null }
                val channelId = currentUri?.queryParameter("id") ?: currentUri?.queryParameter("channel") ?: currentUri?.queryParameter("stream") ?: ""
                val hostSeguro = currentUri?.host ?: "ontve.click"
                val origin = currentUri?.let { "https://${it.host}" } ?: baseUrl

                // js router keyed by channel id
                if (channelId.isNotEmpty()) {
                    val iframeBlocks = """(?:id|channel|stream)\s*===\s*["']([^"']+)["']\)\s*\{[^}]*src=["']([^"']+)["']""".toRegex().findAll(cleanHtml)
                    val match = iframeBlocks.firstOrNull { it.groupValues[1] == channelId }
                    if (match != null) {
                        val decodedIframe = match.groupValues[2]
                        currentReferer = currentUrl
                        currentUrl = if (decodedIframe.startsWith("http")) decodedIframe
                        else if (decodedIframe.startsWith("//")) "https:$decodedIframe"
                        else "https://$hostSeguro/${decodedIframe.removePrefix("/")}"
                        continue
                    }

                    val configBlocks = """["']([^"']+)["']\s*:\s*\{[^}]*url:\s*["']([^"']+)["']""".toRegex().findAll(cleanHtml)
                    val configMatch = configBlocks.firstOrNull { it.groupValues[1] == channelId }
                    if (configMatch != null) {
                        val decodedUrl = configMatch.groupValues[2]
                        currentReferer = currentUrl
                        currentUrl = if (decodedUrl.startsWith("http")) decodedUrl
                        else if (decodedUrl.startsWith("//")) "https:$decodedUrl"
                        else "https://$hostSeguro/${decodedUrl.removePrefix("/")}"
                        continue
                    }
                }

                // p2p style number pairs decode to a url char by char
                val pairRegex = """\[\s*(\d+)\s*,\s*["']([^"']+)["']\s*\]""".toRegex()
                val pairsMatches = pairRegex.findAll(htmlParaAnalizar).toList()

                if (pairsMatches.size > 10) {
                    val pairs = pairsMatches.map { Pair(it.groupValues[1].toInt(), it.groupValues[2]) }.sortedBy { it.first }
                    val firstPair = pairs.firstOrNull { it.first == 0 }

                    if (firstPair != null) {
                        try {
                            val decodedB64 = String(Base64.decode(firstPair.second, Base64.DEFAULT))
                            val numberOnly = decodedB64.replace(Regex("\\D"), "").toLongOrNull()

                            if (numberOnly != null) {
                                val possibleKs = listOf(numberOnly - 104L, numberOnly - 115L, numberOnly - 47L)

                                for (k in possibleKs) {
                                    val playbackUrlBuilder = StringBuilder()
                                    for (pair in pairs) {
                                        val d64 = String(Base64.decode(pair.second, Base64.DEFAULT))
                                        val num = d64.replace(Regex("\\D"), "").toLongOrNull()
                                        if (num != null) {
                                            val charCode = num - k
                                            playbackUrlBuilder.append(charCode.toInt().toChar())
                                        }
                                    }

                                    val finalUrl = playbackUrlBuilder.toString()
                                    if (finalUrl.isNotEmpty() && (finalUrl.startsWith("http") || finalUrl.startsWith("//")) && (finalUrl.contains(".m3u8") || finalUrl.contains(".mpd"))) {
                                        val validUrl = if (finalUrl.startsWith("//")) "https:$finalUrl" else finalUrl
                                        Log.d(TAG, "M3U8 Decodificado exitosamente.")
                                        return Video(validUrl, emptyList(), mapOf("Referer" to currentUrl, "User-Agent" to USER_AGENT, "Origin" to origin))
                                    }
                                }
                            }
                        } catch (_: Exception) {}
                    }
                }

                val m3u8Regex = """(https?://[^"'\s]+\.(?:m3u8|mpd)[^"'\s]*)""".toRegex()
                val relativeRegex = """(?:source|file|src)\s*:\s*["']([^"']+\.(?:m3u8|mpd)[^"']*)["']""".toRegex()

                val allMatches = m3u8Regex.findAll(cleanHtml).map { it.groupValues[1] }.toList() +
                        relativeRegex.findAll(cleanHtml).map { it.groupValues[1] }.toList()

                val validM3u8 = allMatches.firstOrNull { !isDecoy(it) }
                if (validM3u8 != null) {
                    val finalUrl = if (validM3u8.startsWith("http")) validM3u8 else "https://$hostSeguro/${validM3u8.removePrefix("/")}"
                    Log.d(TAG, "M3U8 Encontrado directamente.")
                    return Video(finalUrl, emptyList(), mapOf("Referer" to currentUrl, "User-Agent" to USER_AGENT, "Origin" to origin))
                }

                if (cleanHtml.contains("eval(function(p,a,c,k,e,d)")) {
                    val unpackedJS = JsUnpacker(cleanHtml).unpack()
                    if (!unpackedJS.isNullOrEmpty()) {
                        htmlParaAnalizar += unpackedJS
                        val unpackedMatches = m3u8Regex.findAll(unpackedJS).map { it.groupValues[1] }.toList()
                        val validUnpackedM3u8 = unpackedMatches.firstOrNull { !isDecoy(it) }
                        if (validUnpackedM3u8 != null) {
                            Log.d(TAG, "M3U8 Encontrado en JS.")
                            return Video(validUnpackedM3u8, emptyList(), mapOf("Referer" to currentUrl, "User-Agent" to USER_AGENT, "Origin" to origin))
                        }
                    }
                }

                val base64HttpRegex = """["'](aHR0c[a-zA-Z0-9=]+)["']""".toRegex()
                val b64Matches = base64HttpRegex.findAll(htmlParaAnalizar)
                for (match in b64Matches) {
                    try {
                        val decoded = String(Base64.decode(match.groupValues[1], Base64.DEFAULT))
                        if (decoded.contains(".m3u8") && !isDecoy(decoded)) {
                            return Video(decoded, emptyList(), mapOf("Referer" to currentUrl, "User-Agent" to USER_AGENT, "Origin" to origin))
                        }
                    } catch (_: Exception) {}
                }

                val atobRegex = """atob\(['"]([^"']+)['"]\)""".toRegex()
                val atobMatches = atobRegex.findAll(htmlParaAnalizar)
                var foundHiddenIframe = false

                for (match in atobMatches) {
                    try {
                        val decoded = String(Base64.decode(match.groupValues[1], Base64.DEFAULT))
                        val decodedIframe = Jsoup.parse(decoded).selectFirst("iframe")?.attr("src") ?: if (decoded.startsWith("http")) decoded else ""

                        if (decodedIframe.isNotEmpty() && !isDecoy(decodedIframe)) {
                            currentReferer = currentUrl
                            currentUrl = if (decodedIframe.startsWith("http")) decodedIframe
                            else if (decodedIframe.startsWith("//")) "https:$decodedIframe"
                            else "https://$hostSeguro/${decodedIframe.removePrefix("/")}"
                            foundHiddenIframe = true
                            break
                        }
                    } catch (_: Exception) {}
                }
                if (foundHiddenIframe) continue

                val doc = Jsoup.parse(htmlParaAnalizar)
                val iframes = doc.select("iframe")
                val nextIframe = iframes.firstOrNull {
                    val src = it.attr("src").ifEmpty { it.attr("data-src") }
                    src.isNotEmpty() && !src.contains("chatango") && !src.contains("monetag")
                }?.let { it.attr("src").ifEmpty { it.attr("data-src") } } ?: ""

                if (nextIframe.isNotEmpty() && nextIframe != currentUrl && !isDecoy(nextIframe)) {
                    currentReferer = currentUrl
                    currentUrl = if (nextIframe.startsWith("http")) nextIframe
                    else if (nextIframe.startsWith("//")) "https:$nextIframe"
                    else "https://$hostSeguro/${nextIframe.removePrefix("/")}"
                    continue
                }

                val windowLocationRegex = """(?:window\.location\.replace|window\.location\.href)\s*=\s*['"]([^"']+)['"]""".toRegex()
                val locMatch = windowLocationRegex.find(htmlParaAnalizar)
                if (locMatch != null && !isDecoy(locMatch.groupValues[1])) {
                    val redirectUrl = locMatch.groupValues[1]
                    currentReferer = currentUrl
                    currentUrl = if (redirectUrl.startsWith("http")) redirectUrl
                    else if (redirectUrl.startsWith("//")) "https:$redirectUrl"
                    else "https://$hostSeguro/${redirectUrl.removePrefix("/")}"
                    continue
                }

                break
            } catch (e: Exception) {
                Log.e(TAG, "Error en rastreo: ${e.message}")
                break
            }
        }

        return Video("", emptyList())
    }

}
