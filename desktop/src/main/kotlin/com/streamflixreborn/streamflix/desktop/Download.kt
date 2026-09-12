package com.streamflixreborn.streamflix.desktop

import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.providers.Provider
import com.sun.net.httpserver.HttpExchange
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.io.File
import java.io.RandomAccessFile
import java.net.URI
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

@Serializable
data class DownloadStartRequest(
    val provider: String,
    val itemId: String,
    val type: String, // "movie" | "tv"
    val seasonNumber: Int? = null,
    val episodeId: String? = null,
    val episodeNumber: Int? = null,
    val serverId: String? = null,
    // display name only, used to build the output filename
    val title: String,
)

@Serializable
data class DownloadStartResponse(val success: Boolean, val jobId: String? = null, val error: String? = null)

@Serializable
data class DownloadStatusResponse(
    val phase: String,
    val progress: Double = 0.0,
    val paused: Boolean = false,
    val error: String? = null,
    val filePath: String? = null,
)

@Serializable
data class DownloadDeleteRequest(val path: String)

@Serializable
data class DownloadDeleteResponse(val success: Boolean, val error: String? = null)

@Serializable
data class DownloadJobActionRequest(val jobId: String)

@Serializable
data class DownloadPauseRequest(val jobId: String, val paused: Boolean)

private enum class DownloadPhase { RESOLVING, FETCHING, ENCODING, DONE, FAILED, CANCELLED }

private class DownloadJob {
    @Volatile var phase: DownloadPhase = DownloadPhase.RESOLVING
    @Volatile var progress: Double = 0.0
    @Volatile var paused: Boolean = false
    @Volatile var cancelled: Boolean = false
    @Volatile var error: String? = null
    @Volatile var filePath: String? = null
}

// tracks progress across restarts, keyed by stableDownloadKey since jobId is random per launch
@Serializable
data class DownloadMeta(
    val provider: String,
    val itemId: String,
    val type: String,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val segmentsCompleted: Int = 0,
    val totalSegmentsAtCheckpoint: Int = 0,
)

private fun stableDownloadKey(request: DownloadStartRequest): String {
    val raw = "${request.provider}:${request.itemId}:${request.type}:${request.seasonNumber}:${request.episodeNumber}"
    val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
}

private fun loadMeta(workDir: File): DownloadMeta? {
    val file = File(workDir, "meta.json")
    if (!file.exists()) return null
    return runCatching { json.decodeFromString<DownloadMeta>(file.readText()) }.getOrNull()
}

private fun saveMeta(workDir: File, meta: DownloadMeta) {
    runCatching { File(workDir, "meta.json").writeText(json.encodeToString(meta)) }
        .onFailure { it.printStackTrace() }
}

private class DownloadCancelledException : Exception("cancelled")

// checked between segments and while ffmpeg runs, so pause/cancel take effect right away
private fun checkPauseAndCancel(job: DownloadJob) {
    while (job.paused && !job.cancelled) Thread.sleep(200)
    if (job.cancelled) throw DownloadCancelledException()
}

private val downloadJobs = ConcurrentHashMap<String, DownloadJob>()

// cap concurrent transcodes so a dozen at once dont just make all of them crawl
private val downloadExecutor = Executors.newFixedThreadPool(2)

private fun downloadsDir(): File {
    val configured = System.getenv("STREAMFLIX_DOWNLOADS_DIR")
    val dir = if (!configured.isNullOrBlank()) File(configured) else File(System.getProperty("user.home"), "Downloads/StreamFlix")
    dir.mkdirs()
    return dir
}

// packaged builds set this to the bundled binary, dev just uses whatever's on PATH
private fun ffmpegPath(): String =
    System.getenv("STREAMFLIX_FFMPEG_PATH")?.takeIf { it.isNotBlank() } ?: "ffmpeg"

private fun sanitizeFileName(name: String): String =
    name.replace(Regex("""[\\/:*?"<>|]"""), "_").trim().ifBlank { "download" }

fun handleDownloadStart(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    val body = exchange.requestBody.use { it.readBytes().decodeToString() }
    val request = runCatching { json.decodeFromString<DownloadStartRequest>(body) }.getOrNull()
        ?: return sendJson(exchange, 400, json.encodeToString(DownloadStartResponse(false, error = "invalid body")))
    val provider = providerByName(request.provider)
        ?: return sendJson(exchange, 404, json.encodeToString(DownloadStartResponse(false, error = "unknown provider")))

    val jobId = UUID.randomUUID().toString()
    downloadJobs[jobId] = DownloadJob()
    downloadExecutor.submit { runDownloadJob(jobId, provider, request) }

    sendJson(exchange, 200, json.encodeToString(DownloadStartResponse(true, jobId = jobId)))
}

fun handleDownloadStatus(exchange: HttpExchange) {
    val params = queryParams(exchange)
    val jobId = params["jobId"] ?: return sendJson(exchange, 400, """{"error":"missing jobId"}""")
    val job = downloadJobs[jobId] ?: return sendJson(exchange, 404, """{"error":"unknown job"}""")
    sendJson(exchange, 200, json.encodeToString(DownloadStatusResponse(
        phase = job.phase.name.lowercase(), progress = job.progress, paused = job.paused,
        error = job.error, filePath = job.filePath,
    )))
}

fun handleDownloadCancel(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    val body = exchange.requestBody.use { it.readBytes().decodeToString() }
    val request = runCatching { json.decodeFromString<DownloadJobActionRequest>(body) }.getOrNull()
        ?: return sendJson(exchange, 400, """{"error":"invalid body"}""")
    val job = downloadJobs[request.jobId] ?: return sendJson(exchange, 404, """{"error":"unknown job"}""")
    job.cancelled = true
    sendJson(exchange, 200, """{"success":true}""")
}

fun handleDownloadPause(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    val body = exchange.requestBody.use { it.readBytes().decodeToString() }
    val request = runCatching { json.decodeFromString<DownloadPauseRequest>(body) }.getOrNull()
        ?: return sendJson(exchange, 400, """{"error":"invalid body"}""")
    val job = downloadJobs[request.jobId] ?: return sendJson(exchange, 404, """{"error":"unknown job"}""")
    job.paused = request.paused
    sendJson(exchange, 200, """{"success":true}""")
}

// only serves files under the downloads dir, a bare path param could point anywhere otherwise
private fun isInDownloadsDir(file: File): Boolean =
    file.canonicalFile.path.startsWith(downloadsDir().canonicalFile.path + File.separator)

fun handleDownloadFile(exchange: HttpExchange) {
    val path = queryParams(exchange)["path"]
    val file = path?.let { File(it) }
    if (file == null || !file.isFile || !isInDownloadsDir(file)) {
        exchange.sendResponseHeaders(404, -1)
        exchange.close()
        return
    }

    val length = file.length()
    val range = exchange.requestHeaders.getFirst("Range")
    exchange.responseHeaders.add("Accept-Ranges", "bytes")
    exchange.responseHeaders.add("Content-Type", "video/mp4")

    val (start, end) = if (range != null && range.startsWith("bytes=")) {
        val parts = range.removePrefix("bytes=").split("-", limit = 2)
        (parts[0].toLongOrNull() ?: 0) to (parts.getOrNull(1)?.toLongOrNull() ?: (length - 1))
    } else 0L to (length - 1)

    exchange.responseHeaders.add("Content-Range", "bytes $start-$end/$length")
    exchange.sendResponseHeaders(if (range != null) 206 else 200, end - start + 1)
    RandomAccessFile(file, "r").use { raf ->
        raf.seek(start)
        exchange.responseBody.use { out ->
            val buffer = ByteArray(65536)
            var remaining = end - start + 1
            while (remaining > 0) {
                val n = raf.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                if (n == -1) break
                out.write(buffer, 0, n)
                remaining -= n
            }
        }
    }
}

fun handleDownloadDelete(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    val body = exchange.requestBody.use { it.readBytes().decodeToString() }
    val request = runCatching { json.decodeFromString<DownloadDeleteRequest>(body) }.getOrNull()
        ?: return sendJson(exchange, 400, json.encodeToString(DownloadDeleteResponse(false, error = "invalid body")))
    val file = File(request.path)
    if (!isInDownloadsDir(file)) return sendJson(exchange, 400, json.encodeToString(DownloadDeleteResponse(false, error = "invalid path")))
    val deleted = !file.exists() || file.delete()
    sendJson(exchange, 200, json.encodeToString(DownloadDeleteResponse(deleted, error = if (deleted) null else "could not delete file")))
}

private fun runDownloadJob(jobId: String, provider: Provider, request: DownloadStartRequest) {
    val job = downloadJobs.getValue(jobId)
    val workDir = File(downloadsDir(), ".partial-${stableDownloadKey(request)}")
    try {
        workDir.mkdirs()
        job.phase = DownloadPhase.RESOLVING
        val streamRequest = StreamRequest(
            request.provider, request.itemId, request.type,
            request.seasonNumber, request.episodeId, request.episodeNumber, request.serverId,
        )
        val (video, _) = resolveVideoBlocking(provider, streamRequest)
        checkPauseAndCancel(job)

        job.phase = DownloadPhase.FETCHING
        // only trust a leftover meta.json if its actually for this exact title/episode
        val existingMeta = loadMeta(workDir)?.takeIf {
            it.provider == request.provider && it.itemId == request.itemId && it.type == request.type &&
                it.seasonNumber == request.seasonNumber && it.episodeNumber == request.episodeNumber
        }
        val meta = existingMeta ?: DownloadMeta(request.provider, request.itemId, request.type, request.seasonNumber, request.episodeNumber)
        fetchAndConcatSegments(job, video, workDir, meta) { fraction -> job.progress = fraction }

        job.phase = DownloadPhase.ENCODING
        job.progress = 0.0
        val outFile = File(downloadsDir(), sanitizeFileName(request.title) + ".mp4")
        transcodeToMp4(job, File(workDir, "segments.ts"), outFile)

        job.filePath = outFile.absolutePath
        job.progress = 1.0
        job.phase = DownloadPhase.DONE
    } catch (e: DownloadCancelledException) {
        job.phase = DownloadPhase.CANCELLED
        // an explicit cancel means give up entirely, unlike a crash/timeout theres no reason to keep the partial around
        workDir.deleteRecursively()
    } catch (e: Exception) {
        job.error = e.message ?: "download failed"
        job.phase = DownloadPhase.FAILED
        // partial segments stay on disk so retrying resumes instead of starting over
    } finally {
        if (job.phase == DownloadPhase.DONE) workDir.deleteRecursively()
    }
}

private const val MAX_SEGMENT_BYTES = 30L * 1024 * 1024

private fun fetchBytes(url: String, headers: Map<String, String>?): ByteArray? {
    repeat(2) {
        val bytes = runCatching {
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
                    if (buffer.size() > MAX_SEGMENT_BYTES) return@runCatching null
                }
                buffer.toByteArray()
            }
        }.getOrNull()
        if (bytes != null) return bytes
    }
    return null
}

private fun downloadToFile(job: DownloadJob, url: String, headers: Map<String, String>?, outFile: File, onProgress: (Double) -> Unit) {
    val builder = HttpRequest.newBuilder(URI.create(url)).GET()
    applyHeaders(builder, headers)
    val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream())
    if (response.statusCode() !in 200..299) error("download failed: HTTP ${response.statusCode()}")
    val total = response.headers().firstValueAsLong("content-length").orElse(-1)
    var written = 0L
    outFile.outputStream().buffered().use { out ->
        response.body().use { input ->
            val chunk = ByteArray(65536)
            while (true) {
                checkPauseAndCancel(job)
                val n = input.read(chunk)
                if (n == -1) break
                out.write(chunk, 0, n)
                written += n
                if (total > 0) onProgress(written.toDouble() / total)
            }
        }
    }
}

private data class HlsKey(val key: ByteArray, val explicitIv: ByteArray?)

private fun hexToBytes(hex: String): ByteArray {
    val clean = if (hex.length % 2 == 1) "0$hex" else hex
    return ByteArray(clean.length / 2) { i ->
        ((Character.digit(clean[i * 2], 16) shl 4) + Character.digit(clean[i * 2 + 1], 16)).toByte()
    }
}

// hls spec: no explicit IV means use the segment's own sequence number as one
private fun sequenceIv(sequence: Long): ByteArray {
    val iv = ByteArray(16)
    for (i in 0 until 8) iv[15 - i] = ((sequence shr (i * 8)) and 0xFF).toByte()
    return iv
}

private fun parseKeyLine(line: String, resolve: (String) -> String, headers: Map<String, String>?): HlsKey? {
    val method = Regex("""METHOD=([^,]+)""").find(line)?.groupValues?.get(1)
    if (method == null || method == "NONE") return null
    val uri = Regex("""URI="([^"]+)"""").find(line)?.groupValues?.get(1) ?: return null
    val ivHex = Regex("""IV=0[xX]([0-9A-Fa-f]+)""").find(line)?.groupValues?.get(1)
    val keyBytes = fetchBytes(resolve(uri), headers) ?: error("could not fetch decryption key")
    return HlsKey(keyBytes, ivHex?.let { hexToBytes(it) })
}

private fun decryptAes128(data: ByteArray, key: ByteArray, iv: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
    return cipher.doFinal(data)
}

// each ts segment is its own full aes block, decrypt em one by one and just append the plaintext
private fun fetchAndConcatSegments(job: DownloadJob, video: Video, workDir: File, meta: DownloadMeta, onProgress: (Double) -> Unit) {
    val outFile = File(workDir, "segments.ts")
    val headers = video.headers
    val isDirectFile = !video.source.startsWith("data:", ignoreCase = true) && (
        video.type?.startsWith("video/", ignoreCase = true) == true ||
        Regex("""\.(mp4|mkv|avi|webm|mov|m4v)(?:\?.*)?$""", RegexOption.IGNORE_CASE).containsMatchIn(video.source)
    )
    if (isDirectFile) {
        // no resume here, cant assume every host supports range requests for a plain file
        downloadToFile(job, video.source, headers, outFile, onProgress)
        return
    }

    fun resolve(base: String, uri: String): String {
        if (uri.startsWith("http://") || uri.startsWith("https://")) return uri
        return runCatching { URI.create(base).resolve(uri).toString() }.getOrDefault(uri)
    }

    var fetch = manifestTextFor(video.source, headers) ?: error("could not fetch manifest")

    // master playlist -> grab the lowest bandwidth variant, we transcode down anyway
    if (fetch.text.lineSequence().any { it.startsWith("#EXT-X-STREAM-INF") }) {
        val lines = fetch.text.lines()
        var bestUri: String? = null
        var bestBandwidth = Long.MAX_VALUE
        for (i in lines.indices) {
            val line = lines[i]
            if (!line.startsWith("#EXT-X-STREAM-INF")) continue
            val bandwidth = Regex("""BANDWIDTH=(\d+)""").find(line)?.groupValues?.get(1)?.toLongOrNull() ?: Long.MAX_VALUE
            val uri = lines.getOrNull(i + 1)?.trim()?.takeIf { it.isNotBlank() && !it.startsWith("#") } ?: continue
            if (bandwidth < bestBandwidth) {
                bestBandwidth = bandwidth
                bestUri = uri
            }
        }
        val variantUrl = bestUri?.let { resolve(fetch.url, it) } ?: error("no playable variant in master playlist")
        fetch = manifestTextFor(variantUrl, headers) ?: error("could not fetch variant playlist")
    }

    data class Segment(val url: String, val key: HlsKey?, val iv: ByteArray?)

    val segments = mutableListOf<Segment>()
    var currentKey: HlsKey? = null
    var mediaSequence = 0L
    for (rawLine in fetch.text.lineSequence()) {
        val line = rawLine.trim()
        when {
            line.startsWith("#EXT-X-MEDIA-SEQUENCE") -> mediaSequence = line.substringAfter(":").toLongOrNull() ?: 0L
            line.startsWith("#EXT-X-KEY") -> currentKey = parseKeyLine(line, { u -> resolve(fetch.url, u) }, headers)
            line.startsWith("#") || line.isBlank() -> { /* other tags dont matter for a plain download */ }
            else -> {
                val key = currentKey
                val iv = key?.explicitIv ?: key?.let { sequenceIv(mediaSequence) }
                segments.add(Segment(resolve(fetch.url, line), key, iv))
                mediaSequence++
            }
        }
    }
    if (segments.isEmpty()) error("no segments found in playlist")

    // only resume if the segment count still matches, a different count means the source changed and old bytes wont line up
    val canResume = meta.segmentsCompleted > 0 && meta.totalSegmentsAtCheckpoint == segments.size
    val startIndex = if (canResume) meta.segmentsCompleted else 0
    if (!canResume) outFile.delete()
    saveMeta(workDir, meta.copy(totalSegmentsAtCheckpoint = segments.size, segmentsCompleted = startIndex))
    onProgress(startIndex.toDouble() / segments.size)

    java.io.FileOutputStream(outFile, startIndex > 0).buffered().use { out ->
        segments.forEachIndexed { index, segment ->
            if (index < startIndex) return@forEachIndexed
            checkPauseAndCancel(job)
            val raw = fetchBytes(segment.url, headers) ?: error("failed to fetch segment ${index + 1}/${segments.size}")
            val bytes = if (segment.key != null) decryptAes128(raw, segment.key.key, segment.iv!!) else raw
            out.write(bytes)
            saveMeta(workDir, meta.copy(totalSegmentsAtCheckpoint = segments.size, segmentsCompleted = index + 1))
            onProgress((index + 1).toDouble() / segments.size)
        }
    }
}

// software x264 so every machine gets the same result, pause isnt supported here but cancel is
private fun transcodeToMp4(job: DownloadJob, input: File, output: File) {
    if (job.cancelled) throw DownloadCancelledException()
    val cmd = listOf(
        ffmpegPath(), "-y", "-i", input.absolutePath,
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        // re-encoding audio instead of copying, ts audio needs a bitstream filter to go into mp4 as-is
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        output.absolutePath,
    )
    val process = ProcessBuilder(cmd).redirectErrorStream(true).start()
    val reader = process.inputStream.bufferedReader()
    while (true) {
        if (job.cancelled) {
            process.destroy()
            throw DownloadCancelledException()
        }
        reader.readLine() ?: break
    }
    val exit = process.waitFor()
    if (exit != 0 || !output.exists()) error("ffmpeg exited with code $exit")
}
