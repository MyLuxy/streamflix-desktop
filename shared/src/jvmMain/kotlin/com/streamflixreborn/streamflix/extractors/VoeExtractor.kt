package com.streamflixreborn.streamflix.extractors

import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DecryptHelper
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.HeadlessBrowserResolver
import com.streamflixreborn.streamflix.utils.UserPreferences
import okhttp3.OkHttpClient
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Url
import java.net.URL

class VoeExtractor : Extractor() {

    override val name = "VOE"
    override val mainUrl = "https://voe.sx/"
    override val aliasUrls = listOf("https://jilliandescribecompany.com", "https://mikaylaarealike.com","https://christopheruntilpoint.com","https://walterprettytheir.com","https://crystaltreatmenteast.com","https://lauradaydo.com","https://lancewhosedifficult.com", "https://dianaavoidthey.com", "https://jefferycontrolmodel.com", "https://charlestoughrace.com", "https://richardquestionbuilding.com","https://jessicayeahcatch.com","https://juliewomanwish.com")

    private val webViewResolver = HeadlessBrowserResolver()

    override suspend fun extract(link: String): Video {
        val (service, resolvedBaseUrl) = VoeExtractorService.build(mainUrl, link)

        val parsedUrl = URL(link)
        val originalPath = parsedUrl.path + if (parsedUrl.query != null) "?${parsedUrl.query}" else ""

        var source = service.getSource(originalPath)

        // some links now sit behind an altcha human check before showing the real player,
        // a real browser solves that widget's own challenge itself same as a normal visitor
        if (source.html().contains("altcha-widget")) {
            val gatedUrl = resolvedBaseUrl.trimEnd('/') + originalPath
            val html = webViewResolver.get(
                url = gatedUrl,
                headers = mapOf("Referer" to link),
                completion = { _, html, _ -> !html.contains("altcha-widget") },
            )
            source = Jsoup.parse(html)
        }

        val scriptTag = source.selectFirst("script[type=application/json]")
        val encodedStringInScriptTag = scriptTag?.data()?.trim().orEmpty()
        val encodedString = DecryptHelper.findEncodedRegex(source.html())
        val decryptedContent = if (encodedString != null) {
            DecryptHelper.decrypt(encodedString)
        } else {
            DecryptHelper.decrypt(encodedStringInScriptTag)
        }

        val m3u8 = decryptedContent.get("source")?.asString.orEmpty()
        if (m3u8.isBlank()) throw Exception("VOE source not found")

        val baseSubtitleScript = source.selectFirst("script")?.data()?:""
        var baseSubtitle = ""
        if (baseSubtitleScript.isNotBlank()) {
            val regex = Regex("""var\s+base\s*=\s*['"]([^'"]+)['"]""")
            baseSubtitle = regex.find(baseSubtitleScript)?.groupValues?.get(1)?:""
        }

        // not every video has subs, missing key here used to NPE instead of just empty
        val subtitles = (decryptedContent.get("captions")?.takeIf { it.isJsonArray }?.asJsonArray
            ?: com.google.gson.JsonArray())
        .map { caption ->
            val obj = caption.asJsonObject
                var file = obj.get("file").asString

            Video.Subtitle(
                file = if (file.startsWith("http")) file else baseSubtitle + file,
                label = obj.get("label").asString,
                initialDefault = obj.get("default").asBoolean,
                default = if (UserPreferences.serverAutoSubtitlesDisabled) false else obj.get("default").asBoolean
            )
        }
        return Video(
            source = m3u8,
            subtitles = subtitles,
            useServerSubtitleSetting = true
        )
    }


    private interface VoeExtractorService {

        companion object {
            suspend fun build(baseUrl: String, originalLink: String): Pair<VoeExtractorService, String> {
                val client = OkHttpClient.Builder()
                    .dns(DnsResolver.doh)
                    .followRedirects(true)
                    .followSslRedirects(true)
                    .addInterceptor { chain ->
                        val request = chain.request().newBuilder()
                            .header("Referer", originalLink)
                            .build()
                        chain.proceed(request)
                    }
                    .build()

                val retrofitVOE = Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .client(client)
                    .addConverterFactory(JsoupConverterFactory.create())

                    .build()
                val retrofitVOEBuiled = retrofitVOE.create(VoeExtractorService::class.java)

                val relativePath = if (originalLink.startsWith(baseUrl)) {
                    originalLink.replace(baseUrl, "")
                } else {
                    val parsedUrl = URL(originalLink)
                    parsedUrl.path + if (parsedUrl.query != null) "?${parsedUrl.query}" else ""
                }

                val retrofitVOEhtml = retrofitVOEBuiled.getSource(relativePath).html()

                // grabbing the first https:// in the whole page used to catch ads/analytics
                // links instead of the real redirect, matching the actual window.location.href
                // assignment first is a lot more reliable
                val redirectMatch = Regex("""window\.location\.href\s*=\s*['"](https://[^'"]+)['"]""")
                    .find(retrofitVOEhtml)
                val fallbackMatch = Regex("""https://([a-zA-Z0-9.-]+)(?:/[^'"]*)?""").find(retrofitVOEhtml)
                val redirectBaseUrl = when {
                    redirectMatch != null -> {
                        val host = URL(redirectMatch.groupValues[1]).host
                        "https://$host/"
                    }
                    fallbackMatch != null -> "https://${fallbackMatch.groupValues[1]}/"
                    else -> throw Exception("Base url not found for VOE")
                }

                val retrofitRedirected = Retrofit.Builder()
                    .baseUrl(redirectBaseUrl)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .build()
                return retrofitRedirected.create(VoeExtractorService::class.java) to redirectBaseUrl
            }
        }

        @GET
        @Headers(
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language: it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
            "X-Requested-With: XMLHttpRequest"
        )
        suspend fun getSource(@Url url: String): Document
    }
}