package com.streamflixreborn.streamflix.utils

import com.google.gson.JsonObject
import com.google.gson.JsonParser

object DecryptHelper {
    private val encodedRegex = Regex("""<script\s+type="application/json">(.*?)</script>""", RegexOption.DOT_MATCHES_ALL)

    fun findEncodedRegex(source: String): String? {
        return encodedRegex.find(source)?.groupValues?.getOrNull(1)
    }

    fun decrypt(encodedString: String): JsonObject {
        return decryptF7(encodedString)
    }

    private fun decryptF7(p8: String): JsonObject {
        // used to swallow every failure and hand back an empty object, callers never noticed
        // decryption failed and shipped a video with a blank source url
        val vF = rot13(p8)
        val vF2 = replacePatterns(vF)
        val vF3 = removeUnderscores(vF2)
        val vF4 = Base64.decode(vF3, Base64.NO_WRAP).toString(Charsets.UTF_8)
        val vF5 = charShift(vF4, 3)
        val vF6 = reverse(vF5)
        val vAtob = Base64.decode(vF6, Base64.NO_WRAP).toString(Charsets.UTF_8)

        return JsonParser.parseString(vAtob).asJsonObject
    }

    private fun rot13(input: String): String {
        return input.map { c ->
            when (c) {
                in 'A'..'Z' -> ((c - 'A' + 13) % 26 + 'A'.code).toChar()
                in 'a'..'z' -> ((c - 'a' + 13) % 26 + 'a'.code).toChar()
                else -> c
            }
        }.joinToString("")
    }

    private fun replacePatterns(input: String): String {
        val patterns = listOf("@$", "^^", "~@", "%?", "*~", "!!", "#&")
        return patterns.fold(input) { result, pattern ->
            result.replace(Regex(Regex.escape(pattern)), "_")
        }
    }

    private fun removeUnderscores(input: String): String = input.replace("_", "")

    private fun charShift(input: String, shift: Int): String {
        return input.map { (it.code - shift).toChar() }.joinToString("")
    }

    private fun reverse(input: String): String = input.reversed()
}
