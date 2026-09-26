package com.streamflixreborn.streamflix.extractors

import com.streamflixreborn.streamflix.utils.Log

import com.streamflixreborn.streamflix.utils.Uri
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import kotlinx.coroutines.DelicateCoroutinesApi

object TokenManager {
    var latestQuery: String? = null
}

class VidxGoExtractor : Extractor() {
    override val name = "VidxGo"
    override val mainUrl = "https://v.vidxgo.co"

    @OptIn(DelicateCoroutinesApi::class)
    override suspend fun extract(link: String): Video {
        val client = OkHttpClient.Builder()
            .dns(DnsResolver.doh)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        val uri = Uri.parse(link)
        val referer = "${uri.scheme}://${uri.host}/"

        // movies used to ship the source as a literal `currentSrc = "..."` baked into the page's own
        // (encrypted) script; the site dropped that, movies now go through the same /t/ json endpoint
        // tv episodes already used, just without the season/episode segments
        val apiUrl = if (link.contains("/t/")) link else {
            val id = uri.pathSegments.firstOrNull()
                ?: throw Exception("VidxGo: could not resolve id from $link")
            "${uri.scheme}://${uri.host}/t/$id"
        }

        fun buildRequest() = Request.Builder()
            .url(apiUrl)
            .header("Referer", referer)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .header("sec-fetch-dest", "empty")
            .build()

        val response = client.newCall(buildRequest()).execute()
        val html = response.body?.string() ?: throw Exception("Failed to get HTML from VidxGo")

        val videoUrlRaw = Regex("\"url\"\\s*:\\s*\"([^\"]+)\"").find(html)?.groupValues?.get(1)
            ?: throw Exception("VidxGo: Could not find url in response")
        val videoUrl = videoUrlRaw.replace("\\/", "/")

        var expireTime = Regex("\"expire\"\\s*:\\s*(\\d+)").find(html)?.groupValues?.get(1)?.toLongOrNull()

        val initialUri = Uri.parse(videoUrl)
        TokenManager.latestQuery = initialUri.encodedQuery
        Log.d("TokenManager", "[INIT] Initial token set. expire=${expireTime}, query=${TokenManager.latestQuery?.take(60)}...")

        GlobalScope.launch(Dispatchers.IO) {
            while (true) {
                val delayMs = if (expireTime != null) {
                    val remaining = expireTime!! - System.currentTimeMillis()
                    val delay = (remaining - 15_000).coerceAtLeast(5_000)
                    Log.d("TokenManager", "[SCHEDULE] Next refresh in ${delay / 1000}s (expiry in ${remaining / 1000}s)")
                    delay
                } else {
                    Log.d("TokenManager", "[SCHEDULE] expire not found, retry in 150s")
                    150_000L
                }

                delay(delayMs)
                Log.d("TokenManager", "[REFRESH] Starting token refresh request at: $apiUrl")
                try {
                    val res = client.newCall(buildRequest()).execute()
                    val statusCode = res.code
                    val isSuccessful = res.isSuccessful
                    val newHtml = res.body?.string()
                    res.close()
                    if (!isSuccessful) {
                        Log.w("TokenManager", "[REFRESH] HTTP response error: $statusCode")
                    }

                    if (newHtml != null) {
                        expireTime = Regex("\"expire\"\\s*:\\s*(\\d+)").find(newHtml)?.groupValues?.get(1)?.toLongOrNull()
                        val newUrlStr = Regex("\"url\"\\s*:\\s*\"([^\"]+)\"").find(newHtml)?.groupValues?.get(1)?.replace("\\/", "/")
                        if (newUrlStr != null) {
                            val newUri = Uri.parse(newUrlStr)
                            TokenManager.latestQuery = newUri.encodedQuery
                            Log.d("TokenManager", "[REFRESH] New token saved. New expire=${expireTime}, query=${TokenManager.latestQuery?.take(60)}...")
                        } else {
                            Log.w("TokenManager", "[REFRESH] url not found in the response. Body: ${newHtml.take(200)}")
                        }
                    } else {
                        Log.w("TokenManager", "[REFRESH] Empty response body")
                    }
                } catch (e: Exception) {
                    Log.e("TokenManager", "[REFRESH] Error during token refresh", e)
                    expireTime = System.currentTimeMillis() + 15_000L
                }
            }
        }

        return Video(
            source = videoUrl,
            headers = mapOf(
                "origin" to "https://v.vidxgo.co",
                "referer" to "https://v.vidxgo.co/",
                "sec-fetch-dest" to "empty",
                "sec-fetch-site" to "cross-site"
            ),
            maintainToken = true
        )
    }
}
