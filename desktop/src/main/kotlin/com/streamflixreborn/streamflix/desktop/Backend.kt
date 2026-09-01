package com.streamflixreborn.streamflix.desktop

import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.Show
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.providers.IptvProvider
import com.streamflixreborn.streamflix.providers.Provider
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.InetSocketAddress
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

// run: ./gradlew :desktop:runBackend
private val backendPort = System.getenv("STREAMFLIX_BACKEND_PORT")?.toIntOrNull() ?: 3001

fun main() {
    val server = HttpServer.create(InetSocketAddress("0.0.0.0", backendPort), 0)
    server.executor = Executors.newCachedThreadPool()

    server.createContext("/api/providers") { withCors(it) { handleProviders(it) } }
    server.createContext("/api/home") { withCors(it) { handleHome(it) } }
    server.createContext("/api/search") { withCors(it) { handleSearch(it) } }
    server.createContext("/api/movie") { withCors(it) { handleMovie(it) } }
    server.createContext("/api/tvshow") { withCors(it) { handleTvShow(it) } }
    server.createContext("/api/episodes") { withCors(it) { handleEpisodes(it) } }
    server.createContext("/api/genre") { withCors(it) { handleGenre(it) } }
    server.createContext("/api/movies") { withCors(it) { handleMovies(it) } }
    server.createContext("/api/tvshows") { withCors(it) { handleTvShows(it) } }
    server.createContext("/api/stream") { withCors(it) { handleStream(it) } }
    server.createContext("/manifest.m3u8") { withCors(it) { serveManifest(it) } }
    server.createContext("/segment") { withCors(it) { serveSegment(it) } }
    server.createContext("/direct") { withCors(it) { serveDirect(it) } }
    server.createContext("/image") { withCors(it) { serveImage(it) } }
    server.createContext("/assets") { withCors(it) { serveAsset(it) } }

    server.start()
    println("StreamFlix backend listening on http://0.0.0.0:$backendPort")
}

private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

@Serializable
data class GenreDto(val id: String, val name: String)

@Serializable
data class PeopleDto(val id: String, val name: String, val image: String? = null)

@Serializable
data class SeasonDto(val id: String, val number: Int, val title: String? = null)

@Serializable
data class EpisodeDto(
    val id: String,
    val number: Int,
    val title: String? = null,
    val overview: String? = null,
    val poster: String? = null,
)

@Serializable
data class ShowDto(
    val id: String,
    val title: String,
    val type: String, // "movie" | "tv"
    val poster: String? = null,
    val banner: String? = null,
    val logo: String? = null,
    val overview: String? = null,
    val rating: Double? = null,
    val released: String? = null,
    val runtime: Int? = null,
    val genres: List<GenreDto> = emptyList(),
    val cast: List<PeopleDto> = emptyList(),
    val seasons: List<SeasonDto> = emptyList(),
    // 1 level deep, dont wanna recurse the whole recs graph
    val recommendations: List<ShowDto> = emptyList(),
)

@Serializable
data class CategoryDto(val name: String, val items: List<ShowDto>)

@Serializable
data class ProviderDto(val name: String, val language: String, val movies: Boolean, val tvShows: Boolean, val logo: String, val iptv: Boolean = false)

@Serializable
data class StreamRequest(
    val provider: String,
    val itemId: String,
    val type: String, // "movie" | "tv"
    val seasonNumber: Int? = null,
    val episodeId: String? = null,
    val episodeNumber: Int? = null,
    // pins to one server instead of the usual try-em-all fallback, for the sub/dub picker
    val serverId: String? = null,
)

@Serializable
data class SubtitleDto(val label: String, val url: String, val default: Boolean = false)

@Serializable
data class ServerDto(val id: String, val name: String)

@Serializable
data class StreamResponse(
    val success: Boolean,
    val manifestUrl: String? = null,
    // direct means a plain file like mp4, not an hls playlist
    val type: String = "hls",
    val subtitles: List<SubtitleDto> = emptyList(),
    val servers: List<ServerDto> = emptyList(),
    val error: String? = null,
)

private fun Show.toDto(includeRecommendations: Boolean = true): ShowDto = when (this) {
    is Movie -> ShowDto(
        id = id, title = title, type = "movie", poster = poster, banner = banner, logo = logo, overview = overview,
        rating = rating, released = released, runtime = runtime,
        genres = genres.map { GenreDto(it.id, it.name) },
        cast = cast.map { PeopleDto(it.id, it.name, it.image) },
        recommendations = if (includeRecommendations) recommendations.map { it.toDto(includeRecommendations = false) } else emptyList(),
    )
    is TvShow -> ShowDto(
        id = id, title = title, type = "tv", poster = poster, banner = banner, logo = logo, overview = overview,
        rating = rating, released = released, runtime = runtime,
        genres = genres.map { GenreDto(it.id, it.name) },
        cast = cast.map { PeopleDto(it.id, it.name, it.image) },
        seasons = seasons.map { SeasonDto(it.id, it.number, it.title) },
        recommendations = if (includeRecommendations) recommendations.map { it.toDto(includeRecommendations = false) } else emptyList(),
    )
}

private fun providerByName(name: String?): Provider? =
    Provider.providers.keys.firstOrNull { it.name == name }

private fun withCors(exchange: HttpExchange, handle: () -> Unit) {
    exchange.responseHeaders.add("Access-Control-Allow-Origin", "*")
    exchange.responseHeaders.add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    exchange.responseHeaders.add("Access-Control-Allow-Headers", "Content-Type")
    if (exchange.requestMethod == "OPTIONS") {
        exchange.sendResponseHeaders(204, -1)
        exchange.close()
        return
    }
    runCatching { handle() }.onFailure {
        it.printStackTrace()
        runCatching {
            val bytes = """{"error":"${(it.message ?: "internal error").replace("\"", "'")}"}""".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(500, bytes.size.toLong())
            exchange.responseBody.use { out -> out.write(bytes) }
        }
    }
}

private fun sendJson(exchange: HttpExchange, status: Int, body: String) {
    val bytes = body.toByteArray()
    exchange.responseHeaders.add("Content-Type", "application/json; charset=utf-8")
    exchange.sendResponseHeaders(status, bytes.size.toLong())
    exchange.responseBody.use { it.write(bytes) }
}

private fun queryParams(exchange: HttpExchange): Map<String, String> =
    (exchange.requestURI.rawQuery ?: "").split("&").filter { it.isNotBlank() }
        .associate { pair ->
            val (k, v) = pair.split("=", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
            URLDecoder.decode(k, "UTF-8") to URLDecoder.decode(v, "UTF-8")
        }

// most provider logos are hotlinked/broken, google favicons just work better
private fun faviconUrl(baseUrl: String): String {
    // no scheme = URI treats it as a relative path and host comes back null
    val withScheme = if (baseUrl.contains("://")) baseUrl else "https://$baseUrl"
    val host = runCatching { URI.create(withScheme).host }.getOrNull()
    return if (host.isNullOrBlank()) "" else "https://www.google.com/s2/favicons?domain=$host&sz=128"
}

// pulls its m3u8 playlist from raw.githubusercontent.com, so the google favicon lookup
// on baseUrl shows github's icon instead of pluto's - serve our own bundled logo instead
private fun faviconOverride(providerName: String): String? {
    return if (providerName.startsWith("Pluto TV")) "http://localhost:$backendPort/assets/pluto-tv.webp" else null
}

// these are busted rn, still work if queried directly, just dont show em in the picker
private val HIDDEN_PROVIDERS = setOf(
    "AnyMovie", "SerienStream", "Moflix-stream", "FrenchStream", "CineHax",
    "FrenchAnime", "SuperStream", "Pelisplusto", "Anime Online Ninja", "SFlix",
    "Animefenix", "AnimeFLV", "AnimeSaturn", "AnimeBum", "AfterDark", "CineCalidad", "Frembed", "StreamingIta",
    "1Jour1Film", "Cine24h", "FilmyOnline", "GuardaSerie", "Otakufr", "Zaluknij",
    "SoloLatino", "Poseidonhd2", "Doramasflix", "FlixLatam", "GuardaFlix", "MKissa",
)

private fun handleProviders(exchange: HttpExchange) {
    val dtos = Provider.providers.entries
        .filter { (provider, _) -> provider.name !in HIDDEN_PROVIDERS }
        .map { (provider, support) ->
            val favicon = faviconOverride(provider.name) ?: faviconUrl(provider.baseUrl)
            ProviderDto(provider.name, provider.language, support.movies, support.tvShows, favicon, iptv = provider is IptvProvider)
        }.sortedBy { it.name.lowercase() }
    sendJson(exchange, 200, json.encodeToString(dtos))
}

private fun handleHome(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val categories = runBlocking { provider.getHome() }
    val dtos = categories.mapNotNull { category ->
        val items = category.list.filterIsInstance<Show>().map { it.toDto(includeRecommendations = false) }
        if (items.isEmpty()) null else CategoryDto(category.name, items)
    }
    sendJson(exchange, 200, json.encodeToString(dtos))
}

private fun handleSearch(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val q = params["q"].orEmpty()
    if (q.isBlank()) return sendJson(exchange, 200, "[]")
    val results = runBlocking { provider.search(q) }.filterIsInstance<Show>().map { it.toDto(includeRecommendations = false) }
    sendJson(exchange, 200, json.encodeToString(results))
}

private fun handleMovie(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val id = params["id"] ?: return sendJson(exchange, 400, """{"error":"missing id"}""")
    val movie = runBlocking { provider.getMovie(id) }
    sendJson(exchange, 200, json.encodeToString(movie.toDto()))
}

private fun handleTvShow(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val id = params["id"] ?: return sendJson(exchange, 400, """{"error":"missing id"}""")
    val tvShow = runBlocking { provider.getTvShow(id) }
    sendJson(exchange, 200, json.encodeToString(tvShow.toDto()))
}

// season number not the backend's own season id, frontend already has that number handy
private fun handleEpisodes(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val tvId = params["tvId"] ?: return sendJson(exchange, 400, """{"error":"missing tvId"}""")
    val seasonNumber = params["seasonNumber"]?.toIntOrNull() ?: return sendJson(exchange, 400, """{"error":"missing seasonNumber"}""")
    val episodes = runBlocking {
        val tvShow = provider.getTvShow(tvId)
        val season = tvShow.seasons.firstOrNull { it.number == seasonNumber } ?: return@runBlocking null
        val fromShow = season.episodes.ifEmpty { provider.getEpisodesBySeason(season.id) }
        fromShow
    } ?: return sendJson(exchange, 404, """{"error":"season not found"}""")
    sendJson(exchange, 200, json.encodeToString(episodes.map { EpisodeDto(it.id, it.number, it.title, it.overview, it.poster) }))
}

private fun handleMovies(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val page = params["page"]?.toIntOrNull() ?: 1
    val movies = runBlocking { provider.getMovies(page) }.map { it.toDto(includeRecommendations = false) }
    sendJson(exchange, 200, json.encodeToString(movies))
}

private fun handleTvShows(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val page = params["page"]?.toIntOrNull() ?: 1
    val tvShows = runBlocking { provider.getTvShows(page) }.map { it.toDto(includeRecommendations = false) }
    sendJson(exchange, 200, json.encodeToString(tvShows))
}

private fun handleGenre(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val provider = providerByName(params["provider"]) ?: return sendJson(exchange, 404, """{"error":"unknown provider"}""")
    val id = params["id"] ?: return sendJson(exchange, 400, """{"error":"missing id"}""")
    val genre = runBlocking { provider.getGenre(id) }
    val dto = CategoryDto(genre.name, genre.shows.map { it.toDto(includeRecommendations = false) })
    sendJson(exchange, 200, json.encodeToString(dto))
}

// random token cause urls rotate on re-resolve, cant key by item id
private val streamCache = ConcurrentHashMap<String, Video>()

private fun handleStream(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    val body = exchange.requestBody.use { it.readBytes().decodeToString() }
    val request = runCatching { json.decodeFromString<StreamRequest>(body) }.getOrNull()
        ?: return sendJson(exchange, 400, """{"error":"invalid body"}""")
    val provider = providerByName(request.provider)
        ?: return sendJson(exchange, 404, json.encodeToString(StreamResponse(false, error = "unknown provider")))

    val result = runCatching {
        runBlocking {
            val videoType = if (request.type == "movie") {
                val movie = provider.getMovie(request.itemId)
                Video.Type.Movie(id = movie.id, title = movie.title, releaseDate = movie.released ?: "", poster = movie.poster ?: "", imdbId = movie.imdbId)
            } else {
                val tvShow = provider.getTvShow(request.itemId)
                // some titles just have no episodes on the site, dont crash on empty list
                val season = tvShow.seasons.firstOrNull { it.number == request.seasonNumber }
                    ?: tvShow.seasons.firstOrNull()
                    ?: error("Nessun episodio disponibile per questo titolo su ${provider.name}")
                val episodes = season.episodes.ifEmpty { provider.getEpisodesBySeason(season.id) }
                val episode = episodes.firstOrNull { it.id == request.episodeId }
                    ?: episodes.firstOrNull { it.number == request.episodeNumber }
                    ?: episodes.firstOrNull()
                    ?: error("Nessun episodio disponibile per questo titolo su ${provider.name}")
                Video.Type.Episode(
                    id = episode.id, number = episode.number, title = episode.title, poster = episode.poster, overview = episode.overview,
                    tvShow = Video.Type.Episode.TvShow(tvShow.id, tvShow.title, tvShow.poster, tvShow.banner, tvShow.released, tvShow.imdbId),
                    season = Video.Type.Episode.Season(season.number, season.title),
                )
            }
            // needs the resolved episode id here, request.episodeId is null half the time
            val itemIdForServers = when (videoType) {
                is Video.Type.Movie -> videoType.id
                is Video.Type.Episode -> videoType.id
            }
            val servers = provider.getServers(itemIdForServers, videoType)
            if (servers.isEmpty()) error("no server available")
            // race every listed server instead of waiting on all of them - some extractors
            // (flixlatam's voe/streamwish mirrors) fall back to a real, one-at-a-time headless
            // browser session per server that can each take up to two minutes, so waiting for
            // the slowest one made every stream on those providers hang for minutes even after
            // a fast server had already resolved. once something usable shows up, a short grace
            // window still lets genuinely fast siblings (sub/dub mirrors a beat behind) land in
            // the picker, without waiting on stragglers stuck behind that slow browser fallback
            val resultChannel = Channel<Pair<Video.Server, Result<Video>>>(servers.size)
            val jobs = servers.map { server ->
                async { resultChannel.send(server to runCatching { provider.getVideo(server) }) }
            }
            val working = mutableListOf<Video.Server>()
            var firstSuccess: Pair<Video.Server, Video>? = null
            var requestedMatch: Pair<Video.Server, Video>? = null
            var firstError: Throwable? = null
            var remaining = servers.size

            suspend fun drainOne() {
                val (server, videoResult) = resultChannel.receive()
                remaining--
                val video = videoResult.getOrNull()
                if (video != null && video.source.isNotBlank()) {
                    working.add(server)
                    if (firstSuccess == null) firstSuccess = server to video
                    if (request.serverId == server.id) requestedMatch = server to video
                } else if (firstError == null) {
                    firstError = videoResult.exceptionOrNull()
                }
            }

            while (remaining > 0 && requestedMatch == null && !(request.serverId == null && firstSuccess != null)) {
                drainOne()
            }
            if (firstSuccess != null || requestedMatch != null) {
                withTimeoutOrNull(3_000L) {
                    while (remaining > 0) drainOne()
                }
            }
            jobs.forEach { it.cancel() }
            val picked = requestedMatch ?: firstSuccess
                ?: throw (firstError ?: Exception("no server available"))
            picked.second to working
        }
    }.getOrElse {
        return sendJson(exchange, 200, json.encodeToString(StreamResponse(false, error = it.message ?: "extraction failed")))
    }
    val (video, servers) = result

    val token = UUID.randomUUID().toString()
    streamCache[token] = video
    // subtitle cdns gate on the same referer as the video, the browser cant send that on
    // its own so these need to go through the segment proxy too, not straight to the cdn
    val subtitles = video.subtitles.map {
        SubtitleDto(it.label, "/segment?token=$token&url=" + URLEncoder.encode(it.file, "UTF-8"), it.default)
    }
    val serverDtos = servers.map { ServerDto(it.id, it.name) }
    // trust the extractor's own declared type first, extension guessing is just a
    // fallback for extractors that dont set it (a real playlist can hide behind any
    // extension, and a direct link can just as easily have none at all)
    val isDirectFile = !video.source.startsWith("data:", ignoreCase = true) && (
        video.type?.startsWith("video/", ignoreCase = true) == true ||
        Regex("""\.(mp4|mkv|avi|webm|mov|m4v)(?:\?.*)?$""", RegexOption.IGNORE_CASE).containsMatchIn(video.source)
    )
    val url = if (isDirectFile) {
        "/direct?token=$token&url=" + URLEncoder.encode(video.source, "UTF-8")
    } else {
        "/manifest.m3u8?token=$token"
    }
    sendJson(exchange, 200, json.encodeToString(StreamResponse(
        true, manifestUrl = url, type = if (isDirectFile) "direct" else "hls",
        subtitles = subtitles, servers = serverDtos,
    )))
}

private val httpClient: HttpClient = HttpClient.newBuilder()
    .followRedirects(HttpClient.Redirect.NORMAL)
    // http/2 upgrade negotiation gets flaky across dozens of unrelated hosts on a
    // long running client, 1.1 keeps connection pooling predictable
    .version(HttpClient.Version.HTTP_1_1)
    .connectTimeout(java.time.Duration.ofSeconds(10))
    .build()

private data class CachedImage(val bytes: ByteArray, val contentType: String)

// posters repeat everywhere (home rows, recs, watchlist), keeping them in memory means
// only the first view ever pays for the round trip to the provider
private val imageCache = object : LinkedHashMap<String, CachedImage>(256, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CachedImage>?) = size > 600
}

// java's HttpClient throws on these instead of just ignoring them, extractors set stuff like
// "Connection: keep-alive" all the time since a real browser would too
private val RESTRICTED_HEADERS = setOf(
    "connection", "content-length", "date", "expect", "from", "host", "upgrade", "via", "warning"
)

private fun applyHeaders(builder: HttpRequest.Builder, headers: Map<String, String>?) {
    headers?.forEach { (k, v) -> if (k.lowercase() !in RESTRICTED_HEADERS) builder.header(k, v) }
}

// forwarding whole header map, extractors dont agree on casing for referer/origin
// real playlists are a few kb at most, a mislabeled direct video link (no recognized
// extension so it slips past the isDirectFile check) can be gigabytes, this is what
// stops that from getting buffered whole and hanging the request
private const val MAX_MANIFEST_BYTES = 4 * 1024 * 1024

private fun manifestTextFor(url: String, headers: Map<String, String>?): String? {
    if (url.startsWith("data:")) {
        val payload = url.substringAfter(",", "")
        if (payload.isBlank()) return null
        return runCatching { String(Base64.getDecoder().decode(payload)) }.getOrNull()
    }
    // some cdns (e.g. the tiktok-hijack proxy some extractors ride on) are genuinely flaky -
    // a plain curl retry a second later turns an error page into a real manifest often enough
    // that it's worth one retry here, and either way a non-2xx status must never be handed
    // downstream as if its error body were real manifest text
    repeat(2) {
        val text = runCatching {
            val builder = HttpRequest.newBuilder(URI.create(url)).GET()
            applyHeaders(builder, headers)
            val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream())
            if (response.statusCode() !in 200..299) return@runCatching null
            response.body().use { input ->
                val buffer = java.io.ByteArrayOutputStream()
                val chunk = ByteArray(8192)
                while (true) {
                    val n = input.read(chunk)
                    if (n == -1) break
                    buffer.write(chunk, 0, n)
                    if (buffer.size() > MAX_MANIFEST_BYTES) return@runCatching null
                }
                buffer.toString(Charsets.UTF_8)
            }
        }.getOrNull()
        if (text != null) return text
    }
    return null
}

private fun serveManifest(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val token = params["token"] ?: return run { exchange.sendResponseHeaders(400, -1); exchange.close() }
    val video = streamCache[token] ?: return run { exchange.sendResponseHeaders(404, -1); exchange.close() }
    val targetUrl = params["url"] ?: video.source
    val referer = video.headers?.entries?.firstOrNull { it.key.equals("referer", ignoreCase = true) }?.value

    val text = manifestTextFor(targetUrl, video.headers)
    if (text == null) {
        exchange.sendResponseHeaders(502, -1)
        exchange.close()
        return
    }

    fun resolve(uri: String): String {
        if (uri.startsWith("http://") || uri.startsWith("https://")) return uri
        val base = targetUrl.takeIf { it.startsWith("http") } ?: referer ?: return uri
        return runCatching { URI.create(base).resolve(uri).toString() }.getOrDefault(uri)
    }

    val isMaster = text.lineSequence().any { it.startsWith("#EXT-X-STREAM-INF") }
    val attrUriRegex = Regex("URI=\"([^\"]+)\"")

    val rewritten = buildString {
        for (rawLine in text.lineSequence()) {
            val line = rawLine.trimEnd('\r')
            when {
                line.startsWith("#EXT-X-") && attrUriRegex.containsMatchIn(line) -> {
                    val uri = attrUriRegex.find(line)!!.groupValues[1]
                    val resolved = resolve(uri)
                    val endpoint = if (line.startsWith("#EXT-X-MEDIA")) "/manifest.m3u8" else "/segment"
                    val proxied = "$endpoint?token=$token&url=" + URLEncoder.encode(resolved, "UTF-8")
                    append(line.replace(uri, proxied))
                }
                line.startsWith("#") || line.isBlank() -> append(line)
                else -> {
                    val endpoint = if (isMaster) "/manifest.m3u8" else "/segment"
                    append("$endpoint?token=$token&url=" + URLEncoder.encode(resolve(line), "UTF-8"))
                }
            }
            append("\n")
        }
    }

    val bytes = rewritten.toByteArray()
    exchange.responseHeaders.add("Content-Type", "application/vnd.apple.mpegurl")
    exchange.sendResponseHeaders(200, bytes.size.toLong())
    exchange.responseBody.use { it.write(bytes) }
}

// img tags cant set headers so we spoof referer/ua here and stream the bytes back
private const val ARTWORK_HEADERS_FRAGMENT_KEY = "sf_headers"

private fun decodeArtworkHeaders(rawUrl: String): Map<String, String> {
    val fragment = rawUrl.substringAfter('#', "").takeIf { it.isNotBlank() } ?: return emptyMap()
    val encoded = fragment.split("&").firstOrNull { it.startsWith("$ARTWORK_HEADERS_FRAGMENT_KEY=") }
        ?.substringAfter("=") ?: return emptyMap()
    return runCatching {
        val decoded = String(Base64.getUrlDecoder().decode(encoded), Charsets.UTF_8)
        json.parseToJsonElement(decoded).jsonObject.mapValues { it.value.jsonPrimitive.content }
    }.getOrDefault(emptyMap())
}

private fun stripArtworkFragment(rawUrl: String): String {
    val hashIdx = rawUrl.indexOf('#')
    if (hashIdx == -1) return rawUrl
    val base = rawUrl.substring(0, hashIdx)
    val remaining = rawUrl.substring(hashIdx + 1).split("&")
        .filterNot { it.startsWith("$ARTWORK_HEADERS_FRAGMENT_KEY=") }
        .joinToString("&")
    return if (remaining.isBlank()) base else "$base#$remaining"
}

private fun serveImage(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val rawUrl = params["url"]
    if (rawUrl == null) {
        exchange.sendResponseHeaders(400, -1)
        exchange.close()
        return
    }
    val headers = decodeArtworkHeaders(rawUrl)
    val cleanUrl = stripArtworkFragment(rawUrl)

    val cached = synchronized(imageCache) { imageCache[cleanUrl] }
    if (cached != null) {
        exchange.responseHeaders.add("Content-Type", cached.contentType)
        exchange.responseHeaders.add("Cache-Control", "public, max-age=86400")
        exchange.sendResponseHeaders(200, cached.bytes.size.toLong())
        exchange.responseBody.use { it.write(cached.bytes) }
        return
    }

    runCatching {
        val builder = HttpRequest.newBuilder(URI.create(cleanUrl)).GET()
        if (headers.isNotEmpty()) {
            applyHeaders(builder, headers)
        } else {
            // some cdns 403 a bare request, faking referer as the img's own domain usually works
            runCatching {
                val target = URI.create(cleanUrl)
                builder.header("Referer", "${target.scheme}://${target.host}/")
            }
            builder.header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        }
        val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray())
        val contentType = response.headers().firstValue("content-type").orElse("image/jpeg")
        // a missing upload on wp sites 301s to the homepage instead of a real 404, that
        // lands here as a 200 with html, dont pass that off as a real image
        val isRealImage = response.statusCode() in 200..299 && contentType.startsWith("image/")
        if (isRealImage) {
            exchange.responseHeaders.add("Content-Type", contentType)
            exchange.responseHeaders.add("Cache-Control", "public, max-age=86400")
            synchronized(imageCache) { imageCache[cleanUrl] = CachedImage(response.body(), contentType) }
            exchange.sendResponseHeaders(200, response.body().size.toLong())
            exchange.responseBody.use { it.write(response.body()) }
        } else {
            exchange.responseHeaders.add("Cache-Control", "no-store")
            exchange.sendResponseHeaders(404, -1)
            exchange.close()
        }
    }.onFailure {
        runCatching {
            exchange.responseHeaders.add("Cache-Control", "no-store")
            exchange.sendResponseHeaders(502, -1)
        }
        exchange.close()
    }
}

// bundled local images (currently just the pluto tv logo, see faviconOverride) - a fixed
// allowlist instead of resolving the request path directly, no path traversal to worry about
private val BUNDLED_ASSETS = mapOf("pluto-tv.webp" to "image/webp")

private fun serveAsset(exchange: HttpExchange) {
    val name = exchange.requestURI.path.substringAfterLast('/')
    val contentType = BUNDLED_ASSETS[name]
    val bytes = contentType?.let { object {}.javaClass.classLoader.getResourceAsStream("assets/$name")?.use { it.readBytes() } }
    if (bytes == null) {
        exchange.sendResponseHeaders(404, -1)
        exchange.close()
        return
    }
    exchange.responseHeaders.add("Content-Type", contentType)
    exchange.responseHeaders.add("Cache-Control", "public, max-age=86400")
    exchange.sendResponseHeaders(200, bytes.size.toLong())
    exchange.responseBody.use { it.write(bytes) }
}

private fun serveSegment(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val token = params["token"]
    val targetUrl = params["url"]
    if (token == null || targetUrl == null) {
        exchange.sendResponseHeaders(400, -1)
        exchange.close()
        return
    }
    val video = streamCache[token]
    if (video == null) {
        exchange.sendResponseHeaders(404, -1)
        exchange.close()
        return
    }
    runCatching {
        val builder = HttpRequest.newBuilder(URI.create(targetUrl)).GET()
        applyHeaders(builder, video.headers)
        val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray())
        // some cdns serve subtitles as octet-stream, browsers need the real type to parse a track
        val contentType = if (targetUrl.substringBefore('?').endsWith(".vtt", ignoreCase = true)) "text/vtt"
        else response.headers().firstValue("content-type").orElse("application/octet-stream")
        exchange.responseHeaders.add("Content-Type", contentType)
        exchange.sendResponseHeaders(response.statusCode(), response.body().size.toLong())
        exchange.responseBody.use { it.write(response.body()) }
    }.onFailure {
        it.printStackTrace()
        runCatching { exchange.sendResponseHeaders(502, -1) }
        exchange.close()
    }
}

private fun serveDirect(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val token = params["token"]
    val targetUrl = params["url"]
    if (token == null || targetUrl == null) {
        exchange.sendResponseHeaders(400, -1)
        exchange.close()
        return
    }
    val video = streamCache[token]
    if (video == null) {
        exchange.sendResponseHeaders(404, -1)
        exchange.close()
        return
    }
    runCatching {
        val builder = HttpRequest.newBuilder(URI.create(targetUrl)).GET()
        applyHeaders(builder, video.headers)
        // forward the browser's own range so seeking actually works on a plain file
        exchange.requestHeaders.getFirst("Range")?.let { builder.header("Range", it) }

        val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream())
        val contentType = response.headers().firstValue("content-type").orElse("video/mp4")
        exchange.responseHeaders.add("Content-Type", contentType)
        exchange.responseHeaders.add("Accept-Ranges", "bytes")
        response.headers().firstValue("content-range").ifPresent { exchange.responseHeaders.add("Content-Range", it) }
        val contentLength = response.headers().firstValue("content-length").map { it.toLong() }.orElse(0L)
        // streamed not buffered, needed for big files
        exchange.sendResponseHeaders(response.statusCode(), if (contentLength > 0) contentLength else 0)
        response.body().use { input -> exchange.responseBody.use { output -> input.copyTo(output) } }
    }.onFailure {
        it.printStackTrace()
        runCatching { exchange.sendResponseHeaders(502, -1) }
        exchange.close()
    }
}
