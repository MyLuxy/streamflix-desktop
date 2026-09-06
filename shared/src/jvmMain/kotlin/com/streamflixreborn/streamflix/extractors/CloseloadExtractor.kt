package com.streamflixreborn.streamflix.extractors

import com.streamflixreborn.streamflix.utils.MimeTypes
import com.streamflixreborn.streamflix.utils.Uri
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.providers.RidomoviesProvider
import com.streamflixreborn.streamflix.utils.JsUnpacker
import okhttp3.OkHttpClient
import org.jsoup.nodes.Document
import org.mozilla.javascript.BaseFunction
import org.mozilla.javascript.Context
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Url
import java.util.Base64

// the site's own decryption code has every identifier (function name, local vars, the
// obfuscation "key" strings) renamed on every page load, so regexing for a hardcoded
// function/variable name (the old approach) breaks on the very next reshuffle. running
// their own script in a real JS engine sidesteps that entirely - whatever they call it,
// it still has to produce the value that ends up in jwplayer's `sources` option
class CloseloadExtractor : Extractor() {

    override val name = "Closeload"
    override val mainUrl = "https://closeload.top/"
    override val aliasUrls = listOf("https://ridorapid.closeload.top/")

    override suspend fun extract(link: String): Video {
        val service = Service.build(mainUrl)
        val document = service.get(link, RidomoviesProvider.URL)
        val html = document.toString()

        val varNameMatch = Regex("""sources\s*:\s*\[\s*\{\s*file\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)""")
            .find(html) ?: throw Exception("Can't find the video source variable in the embed page")
        val varName = varNameMatch.groupValues[1]

        // in document order: every inline <script>, plus whatever any p.a.c.k.e.r-packed
        // one of them unpacks to - the decoder can live in either depending on the page
        val candidates = mutableListOf<String>()
        document.select("script").forEach { script ->
            if (script.hasAttr("src")) return@forEach
            val text = script.data().ifBlank { script.html() }
            if (text.isBlank()) return@forEach
            candidates.add(text)
            val unpacker = JsUnpacker(text)
            if (unpacker.detect()) {
                unpacker.unpack()?.let { candidates.add(it) }
            }
        }

        val assignmentRegex = Regex("""\b${Regex.escape(varName)}\s*=""")
        val decoderScript = candidates.find { assignmentRegex.containsMatchIn(it) }
            ?: throw Exception("Can't find the script assigning $varName")

        val sourceValue = runInSandbox(decoderScript, varName)
            ?: throw Exception("Decryption produced no value for $varName")

        if (!sourceValue.startsWith("http")) {
            throw Exception("Decrypted value doesn't look like a URL: $sourceValue")
        }

        val url = Uri.parse(link)
        val referer = "${url.scheme}://${url.host}/"

        return Video(sourceValue, headers = mapOf("Referer" to referer), type = MimeTypes.APPLICATION_M3U8)
    }

    // atob/btoa are browser globals, not part of the JS language itself - the decoder
    // needs a real one (not a stub) since it base64-decodes the actual payload with it
    private fun runInSandbox(script: String, varName: String): String? {
        val cx = Context.enter()
        return try {
            cx.optimizationLevel = -1
            val scope = cx.initStandardObjects()
            registerBase64Globals(cx, scope)
            try {
                cx.evaluateString(scope, script, "closeload-decoder", 1, null)
            } catch (e: Exception) {
                // best-effort: a later, unrelated statement in the same script block
                // throwing doesn't undo the target assignment if it already happened
            }
            val value = ScriptableObject.getProperty(scope, varName)
            if (value == Scriptable.NOT_FOUND || value == null) null else Context.toString(value)
        } finally {
            Context.exit()
        }
    }

    private fun registerBase64Globals(cx: Context, scope: Scriptable) {
        val atob = object : BaseFunction() {
            override fun call(cx: Context, scope: Scriptable, thisObj: Scriptable, args: Array<out Any>): Any {
                val input = Context.toString(args.getOrNull(0) ?: "")
                val cleaned = input.replace(Regex("""\s+"""), "")
                val padded = cleaned + "=".repeat((4 - cleaned.length % 4) % 4)
                val bytes = Base64.getDecoder().decode(padded)
                return String(bytes, Charsets.ISO_8859_1)
            }
        }
        val btoa = object : BaseFunction() {
            override fun call(cx: Context, scope: Scriptable, thisObj: Scriptable, args: Array<out Any>): Any {
                val input = Context.toString(args.getOrNull(0) ?: "")
                val bytes = input.toByteArray(Charsets.ISO_8859_1)
                return Base64.getEncoder().encodeToString(bytes)
            }
        }
        ScriptableObject.putProperty(scope, "atob", atob)
        ScriptableObject.putProperty(scope, "btoa", btoa)
    }

    private interface Service {
        companion object {
            fun build(baseUrl: String): Service {
                val client = OkHttpClient.Builder().build()
                val retrofit = Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .addConverterFactory(GsonConverterFactory.create())
                    .client(client)
                    .build()
                return retrofit.create(Service::class.java)
            }
        }
        @GET
        suspend fun get(@Url url: String, @Header("referer") referer: String): Document
    }
}
