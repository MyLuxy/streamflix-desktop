package com.streamflixreborn.streamflix.utils

import com.streamflixreborn.streamflix.providers.Provider
import org.json.JSONObject
import java.io.File
import java.util.Properties

// desktop stand-in for the Android SharedPreferences-backed UserPreferences, only the keys providers actually read
object UserPreferences {

    private val file = File(System.getProperty("user.home"), ".streamflix/preferences.properties")
    private val props = Properties().apply {
        if (file.exists()) file.inputStream().use { load(it) }
    }

    private fun get(key: String): String? = props.getProperty(key)

    private fun set(key: String, value: String?) {
        if (value == null) props.remove(key) else props.setProperty(key, value)
        file.parentFile?.mkdirs()
        file.outputStream().use { props.store(it, null) }
    }

    const val PROVIDER_URL = "URL"
    const val PROVIDER_LOGO = "LOGO"
    const val PROVIDER_PORTAL_URL = "PORTAL_URL"
    const val PROVIDER_AUTOUPDATE = "AUTOUPDATE_URL"
    const val PROVIDER_NEW_INTERFACE = "NEW_INTERFACE"
    const val PROVIDER_PREFERRED_SERVER = "PREFERRED_SERVER"

    private var providerCache: JSONObject = runCatching { JSONObject(get("provider_cache") ?: "{}") }.getOrDefault(JSONObject())

    fun getProviderCache(provider: Provider, key: String): String {
        return providerCache
            .optJSONObject(provider.name)
            ?.optString(key)
            .orEmpty()
    }

    fun setProviderCache(provider: Provider?, key: String, value: String) {
        val providerName = provider?.name ?: return
        val innerJson = providerCache.optJSONObject(providerName)
            ?: JSONObject().also { providerCache.put(providerName, it) }
        innerJson.put(key, value)
        set("provider_cache", providerCache.toString())
    }

    var providerLanguage: String?
        get() = get("provider_language")
        set(value) = set("provider_language", value)

    var streamingcommunityDomain: String?
        get() = get("streamingcommunity_domain")
        set(value) = set("streamingcommunity_domain", value)

    var enableTmdb: Boolean
        get() = get("enable_tmdb")?.toBooleanStrictOrNull() ?: true
        set(value) = set("enable_tmdb", value.toString())

    // same demo key the frontend falls back to, without a default here tmdb lookups always fail
    var tmdbApiKey: String
        get() = get("tmdb_api_key")?.ifEmpty { null } ?: "2dca580c2a14b55200e784d157207b4d"
        set(value) = set("tmdb_api_key", value)

    // no bundled value on desktop (the Android build injects it from local.properties at build time)
    var rabbitstreamSourceApi: String
        get() = get("rabbitstream_source_api") ?: ""
        set(value) = set("rabbitstream_source_api", value)

    // default matches the Android app's DEFAULT_DOH_PROVIDER_URL: many of these sites' domains
    // are filtered by plain ISP/system DNS, DNS-over-HTTPS is how the app resolves them at all
    var dohProviderUrl: String
        get() = get("doh_provider_url") ?: "https://cloudflare-dns.com/dns-query"
        set(value) = set("doh_provider_url", value)

    var cuevanaDomain: String
        get() = get("cuevana_domain")?.ifEmpty { null } ?: "cuevana.gs"
        set(value) = set("cuevana_domain", value)

    var poseidonDomain: String
        get() = get("poseidon_domain")?.ifEmpty { null } ?: "www.poseidonhd2.co"
        set(value) = set("poseidon_domain", value)

    var serverAutoSubtitlesDisabled: Boolean
        get() = get("server_auto_subtitles_disabled")?.toBooleanStrictOrNull() ?: true
        set(value) = set("server_auto_subtitles_disabled", value.toString())

    var serienstreamDomain: String
        get() = get("serienstream_domain")?.ifEmpty { null } ?: "s.to"
        set(value) = set("serienstream_domain", value)

    var moflixDomain: String
        get() = get("moflix_domain")?.ifEmpty { null } ?: "moflix-stream.xyz"
        set(value) = set("moflix_domain", value)

    // extractors that read currentProvider just get null and fall back if none was ever picked
    var currentProvider: Provider?
        get() = get("selected_provider_name")?.let { Provider.findByName(it) }
        set(value) = set("selected_provider_name", value?.name)

    fun clearProviderCache(providerName: String) {
        if (providerCache.has(providerName)) {
            providerCache.remove(providerName)
            set("provider_cache", providerCache.toString())
        }
    }
}
