package com.streamflixreborn.streamflix.extractors

import com.streamflixreborn.streamflix.utils.MimeTypes

import com.streamflixreborn.streamflix.models.Video
import okhttp3.OkHttpClient
import okhttp3.Request

class ZillaExtractor : Extractor() {

    override val name = "Zilla"
    override val mainUrl = "https://player.zilla-networks.com"

    private val client = OkHttpClient.Builder().build()

    override suspend fun extract(link: String): Video {
        try {
            val id = link.substringAfterLast("/")
            val source = "$mainUrl/m3u8/$id"
            val headers = mapOf(
                "User-Agent" to "Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0",
                "Accept" to "*/*",
                "Accept-Language" to "es-MX,es-ES;q=0.9,es;q=0.8,en-US;q=0.7,en;q=0.6",
                "Referer" to link,
                "Origin" to mainUrl,
            )

            // the manifest itself always loads fine but cloudflare gates the actual
            // segment cdn separately, catch that here so a dead server never wins the pick
            val manifestBody = fetchText(source, headers)
            val firstSegment = Regex("""(?m)^https?://\S+$""").find(manifestBody)?.value
                ?: throw Exception("no segments in manifest")
            val segmentCode = fetchStatus(firstSegment, headers)
            if (segmentCode !in 200..299) throw Exception("segments blocked ($segmentCode)")

            return Video(
                source = source,
                type = MimeTypes.APPLICATION_M3U8,
                headers = headers,
            )
        } catch (e: Exception) {
            throw Exception("ZillaExtractor failed: ${e.message}", e)
        }
    }

    private fun request(url: String, headers: Map<String, String>, headOnly: Boolean): Request {
        val builder = Request.Builder().url(url)
        headers.forEach { (k, v) -> builder.header(k, v) }
        if (headOnly) builder.head()
        return builder.build()
    }

    private fun fetchText(url: String, headers: Map<String, String>): String {
        client.newCall(request(url, headers, headOnly = false)).execute().use { response ->
            return response.body?.string().orEmpty()
        }
    }

    private fun fetchStatus(url: String, headers: Map<String, String>): Int {
        client.newCall(request(url, headers, headOnly = true)).execute().use { response ->
            return response.code
        }
    }
}
