package com.streamflixreborn.streamflix.utils

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import java.io.File
import java.util.concurrent.ConcurrentHashMap

@Serializable
private data class StoredCookie(
    val name: String,
    val value: String,
    val domain: String,
    val path: String,
    val expiresAt: Long,
    val secure: Boolean,
    val httpOnly: Boolean,
    val hostOnly: Boolean,
)

// swaps out android.webkit.CookieManager (not available on desktop) for an in-memory store persisted as JSON
class PersistentCookieJar(private val file: File) : CookieJar {

    private val store = ConcurrentHashMap<String, MutableList<Cookie>>()
    private val json = Json { ignoreUnknownKeys = true }

    init {
        load()
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val list = store.getOrPut(url.host) { mutableListOf() }
        cookies.forEach { cookie ->
            list.removeAll { it.name == cookie.name && it.path == cookie.path }
            list.add(cookie)
        }
        persist()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        return store[url.host]?.filter { it.expiresAt > now && it.matches(url) } ?: emptyList()
    }

    private fun persist() {
        try {
            val all = store.values.flatten().map {
                StoredCookie(it.name, it.value, it.domain, it.path, it.expiresAt, it.secure, it.httpOnly, it.hostOnly)
            }
            file.parentFile?.mkdirs()
            file.writeText(json.encodeToString(all))
        } catch (e: Exception) {
            Log.e("PersistentCookieJar", "Failed to persist cookies: ${e.message}")
        }
    }

    private fun load() {
        if (!file.exists()) return
        try {
            val stored = json.decodeFromString<List<StoredCookie>>(file.readText())
            stored.forEach { sc ->
                val cookie = Cookie.Builder()
                    .name(sc.name)
                    .value(sc.value)
                    .expiresAt(sc.expiresAt)
                    .path(sc.path)
                    .let { if (sc.hostOnly) it.hostOnlyDomain(sc.domain) else it.domain(sc.domain) }
                    .let { if (sc.secure) it.secure() else it }
                    .let { if (sc.httpOnly) it.httpOnly() else it }
                    .build()
                store.getOrPut(sc.domain) { mutableListOf() }.add(cookie)
            }
        } catch (e: Exception) {
            Log.e("PersistentCookieJar", "Failed to load cookies: ${e.message}")
        }
    }
}
