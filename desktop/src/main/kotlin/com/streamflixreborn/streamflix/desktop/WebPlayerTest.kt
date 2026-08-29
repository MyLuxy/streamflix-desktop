package com.streamflixreborn.streamflix.desktop

import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.providers.Provider
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import java.net.InetSocketAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.Base64
import java.util.concurrent.Executors

// standalone proof-of-concept, entirely separate from the real app: proves a browser-based
// player (native <video> + hls.js) can actually play a stream this project's scrapers extract,
// including the Referer/User-Agent spoofing some providers require on every segment request -
// something a browser can't do itself (no custom headers allowed on <video>/fetch to another
// origin), so this server proxies the manifest and every segment/key it references, attaching
// the right headers server-side. Run with: ./gradlew :desktop:runWebPlayerTest
fun main() {
    println("WebPlayerTest: extracting a real video from StreamingCommunity...")
    val video = runBlocking { extractSampleVideo() }
    if (video == null) {
        println("WebPlayerTest: could not extract a sample video, aborting.")
        return
    }
    println("WebPlayerTest: got source=${video.source.take(80)}... headers=${video.headers}")

    val server = HttpServer.create(InetSocketAddress("127.0.0.1", 8099), 0)
    server.executor = Executors.newCachedThreadPool()
    server.createContext("/") { exchange -> servePage(exchange) }
    server.createContext("/manifest.m3u8") { exchange -> serveManifest(exchange, video) }
    server.createContext("/segment") { exchange -> serveSegment(exchange, video) }
    server.start()
    println("WebPlayerTest: open http://127.0.0.1:8099/ in a browser")
}

private suspend fun extractSampleVideo(): Video? {
    val provider = Provider.providers.keys.firstOrNull { it.name == "StreamingCommunity" }
        ?: Provider.providers.keys.first()
    return runCatching {
        val home = provider.getHome()
        val listed = home.asSequence().flatMap { it.list.asSequence() }.filterIsInstance<TvShow>().first()
        val tvShow = provider.getTvShow(listed.id)
        val season = tvShow.seasons.first()
        val episodes = season.episodes.ifEmpty { provider.getEpisodesBySeason(season.id) }
        val episode = episodes.first()
        val videoType = Video.Type.Episode(
            id = episode.id,
            number = episode.number,
            title = episode.title,
            poster = episode.poster,
            overview = episode.overview,
            tvShow = Video.Type.Episode.TvShow(tvShow.id, tvShow.title, tvShow.poster, tvShow.banner, tvShow.released, tvShow.imdbId),
            season = Video.Type.Episode.Season(season.number, season.title),
        )
        val server = provider.getServers(episode.id, videoType).first()
        provider.getVideo(server)
    }.onFailure { it.printStackTrace() }.getOrNull()
}

private fun servePage(exchange: HttpExchange) {
    val html = """
        <!doctype html>
        <html>
        <head>
        <meta charset="utf-8">
        <title>StreamFlix web player test</title>
        <style>
          body { background:#0a0a0c; color:#eee; font-family: sans-serif; display:flex; flex-direction:column; align-items:center; padding:32px; }
          video { width:100%; max-width:960px; background:#000; }
        </style>
        </head>
        <body>
        <h2>StreamFlix - web player proof of concept</h2>
        <p>Native browser controls (play/pause/seek/volume/fullscreen) - no custom overlay.</p>
        <video id="v" controls autoplay></video>
        <p id="status">loading...</p>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
        <script>
          const video = document.getElementById('v');
          const status = document.getElementById('status');
          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.on(Hls.Events.ERROR, (event, data) => { status.textContent = 'hls.js error: ' + data.type + ' / ' + data.details; });
            hls.loadSource('/manifest.m3u8');
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => { status.textContent = 'manifest parsed, playing'; });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = '/manifest.m3u8';
          } else {
            status.textContent = 'HLS not supported in this browser';
          }
        </script>
        </body>
        </html>
    """.trimIndent()
    val bytes = html.toByteArray()
    exchange.responseHeaders.add("Content-Type", "text/html; charset=utf-8")
    exchange.sendResponseHeaders(200, bytes.size.toLong())
    exchange.responseBody.use { it.write(bytes) }
}

private val httpClient: HttpClient = HttpClient.newBuilder().build()

// fetches (or decodes, for a data: URI) the manifest text for `url`, rewrites every URI line to
// route back through this server so segments/sub-manifests/keys carry our spoofed headers too
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

private fun serveManifest(exchange: HttpExchange, video: Video) {
    val query = exchange.requestURI.rawQuery
    val targetUrl = query?.let { parseQueryParam(it, "url") } ?: video.source
    val referer = video.headers?.get("Referer")
    val userAgent = video.headers?.get("User-Agent")

    val text = manifestTextFor(targetUrl, referer, userAgent)
    if (text == null) {
        exchange.sendResponseHeaders(502, -1)
        exchange.close()
        return
    }

    // URIs inside a manifest (segments, sub-manifests, AES keys, alternate audio/subtitle
    // renditions) can be relative to the manifest's OWN url rather than absolute - vixcloud's
    // encryption key ("/storage/enc.key") is - so every one of them has to be resolved against
    // that base before being handed to /segment or /manifest.m3u8, otherwise the proxy tries to
    // fetch a bare path with no scheme/host and fails
    fun resolve(uri: String): String {
        if (uri.startsWith("http://") || uri.startsWith("https://")) return uri
        val base = targetUrl.takeIf { it.startsWith("http") } ?: referer ?: return uri
        return runCatching { URI.create(base).resolve(uri).toString() }.getOrDefault(uri)
    }

    // a manifest is either a MASTER playlist (STREAM-INF entries whose URIs point at other
    // manifests) or a MEDIA playlist (EXTINF entries whose URIs point at actual segments) - never
    // both, so one check up front decides how every plain URI line in it should be rewritten
    val isMaster = text.lineSequence().any { it.startsWith("#EXT-X-STREAM-INF") }
    val attrUriRegex = Regex("URI=\"([^\"]+)\"")

    val rewritten = buildString {
        for (rawLine in text.lineSequence()) {
            val line = rawLine.trimEnd('\r')
            when {
                // any #EXT-X-* tag can carry a URI="..." attribute (KEY, MAP, MEDIA for
                // alternate audio/subtitle renditions, ...) - handled generically instead of
                // enumerating every tag name, so nothing slips through unrewritten
                line.startsWith("#EXT-X-") && attrUriRegex.containsMatchIn(line) -> {
                    val uri = attrUriRegex.find(line)!!.groupValues[1]
                    val resolved = resolve(uri)
                    // an alternate-rendition URI (EXT-X-MEDIA) points at another manifest, same
                    // as a master playlist's variant entries do; a key/init-segment URI points
                    // at a small binary blob, same as a media segment does
                    val endpoint = if (line.startsWith("#EXT-X-MEDIA")) "/manifest.m3u8" else "/segment"
                    val proxied = "$endpoint?url=" + java.net.URLEncoder.encode(resolved, "UTF-8")
                    append(line.replace(uri, proxied))
                }
                line.startsWith("#") || line.isBlank() -> append(line)
                else -> {
                    val endpoint = if (isMaster) "/manifest.m3u8" else "/segment"
                    append("$endpoint?url=" + java.net.URLEncoder.encode(resolve(line), "UTF-8"))
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

private fun serveSegment(exchange: HttpExchange, video: Video) {
    val query = exchange.requestURI.rawQuery ?: ""
    val targetUrl = parseQueryParam(query, "url")
    if (targetUrl == null) {
        exchange.sendResponseHeaders(400, -1)
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

private fun parseQueryParam(rawQuery: String, name: String): String? =
    rawQuery.split("&").firstOrNull { it.startsWith("$name=") }
        ?.substringAfter("=")
        ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
