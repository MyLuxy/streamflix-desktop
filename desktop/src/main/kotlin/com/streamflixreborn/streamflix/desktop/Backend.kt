package com.streamflixreborn.streamflix.desktop

import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.Show
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.providers.Provider
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
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

// the real HTTP API for the web UI (see WebPlayerTest.kt for the proof-of-concept this grew out
// of): catalog/search/detail endpoints backed by whichever provider the client asks for, plus a
// generic (not single-hardcoded-video) HLS proxy so any extracted stream can be played through a
// plain browser <video> + hls.js. Run with: ./gradlew :desktop:runBackend
fun main() {
    val port = System.getenv("STREAMFLIX_BACKEND_PORT")?.toIntOrNull() ?: 3001
    val server = HttpServer.create(InetSocketAddress("0.0.0.0", port), 0)
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
    server.createContext("/image") { withCors(it) { serveImage(it) } }

    server.start()
    println("StreamFlix backend listening on http://0.0.0.0:$port")
}

private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

// ---- DTOs: a deliberately separate shape from the internal :shared models, so the web UI's
// contract doesn't silently change every time a provider's model gains a field ----

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
    // only populated one level deep (a recommended item's own recommendations are left empty) -
    // this is for a detail page's "you might also like" row, not for building a whole graph
    val recommendations: List<ShowDto> = emptyList(),
)

@Serializable
data class CategoryDto(val name: String, val items: List<ShowDto>)

@Serializable
data class ProviderDto(val name: String, val language: String, val movies: Boolean, val tvShows: Boolean, val logo: String)

@Serializable
data class StreamRequest(
    val provider: String,
    val itemId: String,
    val type: String, // "movie" | "tv"
    val seasonNumber: Int? = null,
    val episodeId: String? = null,
    val episodeNumber: Int? = null,
)

@Serializable
data class SubtitleDto(val label: String, val url: String, val default: Boolean = false)

@Serializable
data class StreamResponse(
    val success: Boolean,
    val manifestUrl: String? = null,
    val subtitles: List<SubtitleDto> = emptyList(),
    val error: String? = null,
)

// includeRecommendations=false for anything nested (a recommended item's own recommendations,
// items inside a category/search list) - only a detail page actually renders that row, so there's
// no point paying for it (or risking runaway recursion) everywhere else
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

// ---- provider lookup + tiny request/response plumbing ----

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

// ---- catalog/search/detail endpoints ----

// ogni provider ha un logo hardcoded che punta a un asset del sito stesso (vedi le decine di
// `override val logo = ...` nei singoli Provider.kt) - molti di questi sono hotlink-protetti,
// su domini che ruotano o vanno giù, o semplicemente path rotti mai aggiornati. Un servizio
// favicon esterno risolve il dominio corrente una volta sola e serve un'icona già pronta, senza
// dipendere dalla disponibilità/config di ciascun sito pirata - molto più affidabile su ~76 provider
private fun faviconUrl(baseUrl: String): String {
    // alcuni provider (es. StreamingCommunityProvider.baseUrl = DEFAULT_DOMAIN) espongono un
    // dominio nudo senza schema - URI.create senza "://" lo tratta come un path relativo, non
    // un'autorità, quindi .host torna null e il logo restava vuoto
    val withScheme = if (baseUrl.contains("://")) baseUrl else "https://$baseUrl"
    val host = runCatching { URI.create(withScheme).host }.getOrNull()
    return if (host.isNullOrBlank()) "" else "https://www.google.com/s2/favicons?domain=$host&sz=128"
}

private fun handleProviders(exchange: HttpExchange) {
    val dtos = Provider.providers.entries.map { (provider, support) ->
        ProviderDto(provider.name, provider.language, support.movies, support.tvShows, faviconUrl(provider.baseUrl))
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

// keyed by (tvId, season NUMBER) rather than the backend's own season id - the frontend has no
// reliable, cross-request way to remember an opaque season id (same reasoning as the provider+id
// slug encoding elsewhere), but the season NUMBER is already right there in the TV show's own
// season list it already fetched, no extra lookup needed on that end
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

// ---- stream resolution + token-based HLS proxy ----

// keyed by a random per-request token rather than the item id, since re-resolving the same
// title can legitimately return different (rotated) tokens/urls from the provider each time -
// the token here is purely a handle for THIS proxy to find the right headers/source again
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
                val season = tvShow.seasons.firstOrNull { it.number == request.seasonNumber } ?: tvShow.seasons.first()
                val episodes = season.episodes.ifEmpty { provider.getEpisodesBySeason(season.id) }
                val episode = episodes.firstOrNull { it.id == request.episodeId }
                    ?: episodes.firstOrNull { it.number == request.episodeNumber }
                    ?: episodes.first()
                Video.Type.Episode(
                    id = episode.id, number = episode.number, title = episode.title, poster = episode.poster, overview = episode.overview,
                    tvShow = Video.Type.Episode.TvShow(tvShow.id, tvShow.title, tvShow.poster, tvShow.banner, tvShow.released, tvShow.imdbId),
                    season = Video.Type.Episode.Season(season.number, season.title),
                )
            }
            // usa l'id RISOLTO da videoType (episode.id per le serie), non request.episodeId - che
            // arriva null ogni volta che si riprende da "continua a guardare" o da un bare
            // ?watch=sXeY (mai passato dal picker episodi) - altrimenti per le serie si ripiegava
            // su request.itemId, cioe l'id dello SHOW, mai un episodio valido: getServers riceveva
            // un id senza senso e la pagina finiva per mostrare il contenuto sbagliato
            val itemIdForServers = when (videoType) {
                is Video.Type.Movie -> videoType.id
                is Video.Type.Episode -> videoType.id
            }
            val server = provider.getServers(itemIdForServers, videoType).firstOrNull() ?: error("no server available")
            provider.getVideo(server)
        }
    }.getOrElse {
        return sendJson(exchange, 200, json.encodeToString(StreamResponse(false, error = it.message ?: "extraction failed")))
    }

    val token = UUID.randomUUID().toString()
    streamCache[token] = result
    val subtitles = result.subtitles.map { SubtitleDto(it.label, it.file, it.default) }
    sendJson(exchange, 200, json.encodeToString(StreamResponse(true, manifestUrl = "/manifest.m3u8?token=$token", subtitles = subtitles)))
}

private val httpClient: HttpClient = HttpClient.newBuilder()
    .followRedirects(HttpClient.Redirect.NORMAL)
    .build()

private fun manifestTextFor(url: String, referer: String?, userAgent: String?): String? {
    if (url.startsWith("data:")) {
        val payload = url.substringAfter(",", "")
        if (payload.isBlank()) return null
        return runCatching { String(Base64.getDecoder().decode(payload)) }.getOrNull()
    }
    return runCatching {
        val builder = HttpRequest.newBuilder(URI.create(url)).GET()
        referer?.let { builder.header("Referer", it) }
        userAgent?.let { builder.header("User-Agent", it) }
        httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString()).body()
    }.getOrNull()
}

private fun serveManifest(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val token = params["token"] ?: return run { exchange.sendResponseHeaders(400, -1); exchange.close() }
    val video = streamCache[token] ?: return run { exchange.sendResponseHeaders(404, -1); exchange.close() }
    val targetUrl = params["url"] ?: video.source
    val referer = video.headers?.get("Referer")
    val userAgent = video.headers?.get("User-Agent")

    val text = manifestTextFor(targetUrl, referer, userAgent)
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

// ---- artwork proxy: some providers hotlink-protect their logos/posters and only serve them to
// requests carrying a specific Referer/User-Agent. The Android app spoofs those per-request via an
// OkHttp interceptor that reads them from a `#sf_headers=<base64url json>` fragment tacked onto the
// image URL (see ArtworkRequestHeaders.kt) - a browser <img> tag can't set custom request headers,
// so this proxy does the same header spoofing server-side and streams the bytes back instead ----
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

    runCatching {
        val builder = HttpRequest.newBuilder(URI.create(cleanUrl)).GET()
        headers.forEach { (k, v) -> builder.header(k, v) }
        val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray())
        val contentType = response.headers().firstValue("content-type").orElse("image/jpeg")
        exchange.responseHeaders.add("Content-Type", contentType)
        // only cache a real image - caching a transient upstream failure (rate limit, momentary
        // block, ...) would lock the browser into showing a broken image for a full day even once
        // the source is reachable again, since it'd never re-request an already-cached URL
        if (response.statusCode() in 200..299) {
            exchange.responseHeaders.add("Cache-Control", "public, max-age=86400")
        } else {
            exchange.responseHeaders.add("Cache-Control", "no-store")
        }
        exchange.sendResponseHeaders(response.statusCode(), response.body().size.toLong())
        exchange.responseBody.use { it.write(response.body()) }
    }.onFailure {
        runCatching {
            exchange.responseHeaders.add("Cache-Control", "no-store")
            exchange.sendResponseHeaders(502, -1)
        }
        exchange.close()
    }
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
    val referer = video.headers?.get("Referer")
    val userAgent = video.headers?.get("User-Agent")

    runCatching {
        val builder = HttpRequest.newBuilder(URI.create(targetUrl)).GET()
        referer?.let { builder.header("Referer", it) }
        userAgent?.let { builder.header("User-Agent", it) }
        val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray())
        val contentType = response.headers().firstValue("content-type").orElse("application/octet-stream")
        exchange.responseHeaders.add("Content-Type", contentType)
        exchange.sendResponseHeaders(response.statusCode(), response.body().size.toLong())
        exchange.responseBody.use { it.write(response.body()) }
    }.onFailure {
        it.printStackTrace()
        runCatching { exchange.sendResponseHeaders(502, -1) }
        exchange.close()
    }
}
