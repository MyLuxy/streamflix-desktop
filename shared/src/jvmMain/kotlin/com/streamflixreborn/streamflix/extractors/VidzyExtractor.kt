package com.streamflixreborn.streamflix.extractors

import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import com.streamflixreborn.streamflix.models.Video
import org.jsoup.nodes.Document
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Url
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.UserPreferences
import com.streamflixreborn.streamflix.utils.Base64
import okhttp3.OkHttpClient
import java.net.URL

class VidzyExtractor : Extractor() {

    override val name = "Vidzy"
    override val mainUrl = "https://vidzy.org"

    // the source used to hide behind eval() packed js, now it's an inline iife that
    // xor-decodes a base64 blob with a key derived from the embed page's own hostname
    private fun decodeXorSource(encoded: String, host: String): String {
        val hostSum = host.sumOf { it.code } and 0xFF
        val reversedBytes = Base64.decode(encoded, Base64.DEFAULT).reversedArray()
        return buildString {
            reversedBytes.forEachIndexed { i, b ->
                val key = (0x3d + i * 89 + hostSum) and 0xFF
                append(((b.toInt() and 0xFF) xor key).toChar())
            }
        }
    }

    // subtitle urls aren't obfuscated anymore, just wrapped in a same-origin rewrite that's
    // a no-op for us since the literal url already points at the right host
    private fun extractSubtitles(html: String): List<Video.Subtitle> {
        val trackRegex = Regex(
            """kind:\s*'subtitles',\s*srclang:\s*'([^']*)',\s*label:\s*'([^']*)',\s*src:\s*\(function\(u\).*?\}\)\('([^']+)'\)"""
        )
        return trackRegex.findAll(html).map { match ->
            val (_, label, file) = match.destructured
            Video.Subtitle(
                file = file,
                label = label,
                default = !UserPreferences.serverAutoSubtitlesDisabled
            )
        }.toList()
    }

    override suspend fun extract(link: String): Video {
        val service = Service.build(mainUrl)

        val document = service.get(link)
        val html = document.html()

        val encoded = Regex("""\}\)\("([A-Za-z0-9+/=]+)"\)""").find(html)?.groupValues?.get(1)
            ?: throw Exception("Packed JS not found")

        val host = runCatching { URL(link).host }.getOrDefault("")
        val streamUrl = decodeXorSource(encoded, host).takeIf { it.startsWith("http") }
            ?: throw Exception("No src found")

        return Video(
            source = streamUrl,
            headers = mapOf("Referer" to mainUrl),
            subtitles = extractSubtitles(html),
            useServerSubtitleSetting = true
        )
    }

    private interface Service {
        companion object {
            private const val DEFAULT_USER_AGENT =
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

            val client = OkHttpClient.Builder()
                .dns(DnsResolver.doh)
                .addInterceptor { chain ->
                    val request = chain.request().newBuilder()
                        .header("User-Agent", DEFAULT_USER_AGENT)
                        .apply {
                            UserPreferences.currentProvider?.baseUrl?.let { header("Referer", it) }
                        }
                        .build()
                    chain.proceed(request)
                }
                .build()
            fun build(baseUrl: String): Service {
                val retrofit = Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .client(client)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .build()

                return retrofit.create(Service::class.java)
            }
        }

        @GET
        suspend fun get(@Url url: String): Document
    }
}
