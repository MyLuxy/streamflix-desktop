package com.streamflixreborn.streamflix.utils

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request

// The Android app uses Cronet here (Chromium's network stack) instead of OkHttp, presumably for
// its TLS/HTTP2 fingerprint against Cloudflare. No portable Cronet build exists for desktop, so
// this is a plain OkHttp GET with the same Response shape AnimeOnlineNinjaProvider expects -
// same headers, same semantics, just a different HTTP client underneath.
object AnimeOnlineNinjaCronetClient {

    data class Response(
        val statusCode: Int,
        val finalUrl: String,
        val body: ByteArray,
    ) {
        val isSuccessful: Boolean get() = statusCode in 200..299
        fun bodyAsString(): String = body.toString(Charsets.UTF_8)
    }

    suspend fun get(url: String, headers: Map<String, String>, useCache: Boolean = false): Response =
        withContext(Dispatchers.IO) {
            val requestBuilder = Request.Builder().url(url)
            headers.forEach { (k, v) -> requestBuilder.header(k, v) }
            NetworkClient.default.newCall(requestBuilder.build()).execute().use { resp ->
                Response(
                    statusCode = resp.code,
                    finalUrl = resp.request.url.toString(),
                    body = resp.body?.bytes() ?: ByteArray(0),
                )
            }
        }
}
