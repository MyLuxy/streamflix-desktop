package com.streamflixreborn.streamflix.utils

import java.net.URLDecoder
import java.net.URLEncoder

// desktop stand-in for android.net.Uri: same handful of methods the ported extractors/providers
// actually call (parse/encode/path/getQueryParameter/encodedQuery), lenient like the Android one
// (accepts relative paths and malformed input instead of throwing)
class Uri private constructor(private val raw: String) {

    val scheme: String?
        get() = raw.substringBefore("://", "").ifEmpty { null }

    val host: String?
        get() {
            val schemeIdx = raw.indexOf("://")
            if (schemeIdx == -1) return null
            val afterScheme = raw.substring(schemeIdx + 3)
            val authority = afterScheme.substringBefore('/').substringBefore('?').substringBefore('#')
            return authority.substringAfter('@').substringBefore(':').ifEmpty { null }
        }

    val path: String?
        get() {
            val noFragment = raw.substringBefore('#')
            val noQuery = noFragment.substringBefore('?')
            val schemeIdx = noQuery.indexOf("://")
            if (schemeIdx == -1) return noQuery
            val afterAuthority = noQuery.indexOf('/', schemeIdx + 3)
            return if (afterAuthority == -1) "" else noQuery.substring(afterAuthority)
        }

    val pathSegments: List<String>
        get() = path.orEmpty().split('/').filter { it.isNotEmpty() }

    val encodedQuery: String?
        get() = raw.substringAfter('?', "").substringBefore('#').ifEmpty { null }

    fun getQueryParameter(key: String): String? {
        val query = encodedQuery ?: return null
        return query.split("&").firstNotNullOfOrNull { pair ->
            val idx = pair.indexOf('=')
            if (idx == -1) null else {
                val k = runCatching { URLDecoder.decode(pair.substring(0, idx), "UTF-8") }.getOrDefault(pair.substring(0, idx))
                if (k == key) runCatching { URLDecoder.decode(pair.substring(idx + 1), "UTF-8") }.getOrDefault(pair.substring(idx + 1)) else null
            }
        }
    }

    override fun toString() = raw

    companion object {
        fun parse(uriString: String): Uri = Uri(uriString)
        fun encode(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
    }
}

fun String.toUri(): Uri = Uri.parse(this)
