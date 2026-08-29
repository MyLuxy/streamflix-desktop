package com.streamflixreborn.streamflix.utils

import okhttp3.ConnectionSpec
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.TlsVersion
import okhttp3.logging.HttpLoggingInterceptor
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

object NetworkClient {

    private const val TAG = "NetworkClient"

    const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    var debugLogging = false

    private val cookieStoreFile = File(System.getProperty("user.home"), ".streamflix/cookies.json")
    val cookieJar = PersistentCookieJar(cookieStoreFile)

    private val loggingInterceptor by lazy {
        HttpLoggingInterceptor { message -> Log.d(TAG, "[OkHttp] $message") }
            .apply { level = HttpLoggingInterceptor.Level.HEADERS }
    }

    val default: OkHttpClient by lazy { buildClient(DnsResolver.doh) }
    val systemDns: OkHttpClient by lazy { buildClient(Dns.SYSTEM) }
    val noRedirects: OkHttpClient by lazy { buildClient(DnsResolver.doh) { it.followRedirects(false).followSslRedirects(false) } }

    val trustAll: OkHttpClient by lazy {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = arrayOf()
        })
        val sslContext = SSLContext.getInstance("TLS").apply { init(null, trustAllCerts, SecureRandom()) }
        buildClient(DnsResolver.doh) {
            it.sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
              .hostnameVerifier { _, _ -> true }
        }
    }

    private fun buildClient(dns: Dns, customizer: ((OkHttpClient.Builder) -> Unit)? = null): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val original = chain.request()
                val requestBuilder = original.newBuilder()
                val isCorsRequest = original.header("Sec-Fetch-Mode") == "cors" ||
                        original.header("Sec-Fetch-Dest") == "empty"
                // Only set default headers if not already provided by the caller (e.g. an extractor)
                if (original.header("User-Agent") == null)
                    requestBuilder.header("User-Agent", USER_AGENT)
                if (original.header("Accept") == null)
                    requestBuilder.header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
                if (original.header("Accept-Language") == null)
                    requestBuilder.header("Accept-Language", "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7")
                if (!isCorsRequest && original.header("Sec-Fetch-Dest") == null)
                    requestBuilder.header("Sec-Fetch-Dest", "document")
                if (!isCorsRequest && original.header("Sec-Fetch-Mode") == null)
                    requestBuilder.header("Sec-Fetch-Mode", "navigate")
                if (!isCorsRequest && original.header("Sec-Fetch-Site") == null)
                    requestBuilder.header("Sec-Fetch-Site", "none")
                if (!isCorsRequest && original.header("Upgrade-Insecure-Requests") == null)
                    requestBuilder.header("Upgrade-Insecure-Requests", "1")
                chain.proceed(requestBuilder.build())
            }
            .cookieJar(cookieJar)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .dns(dns)

        // Modern and compatible TLS configuration
        val spec = ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
            .tlsVersions(TlsVersion.TLS_1_3, TlsVersion.TLS_1_2, TlsVersion.TLS_1_1, TlsVersion.TLS_1_0)
            .build()
        builder.connectionSpecs(listOf(spec, ConnectionSpec.COMPATIBLE_TLS, ConnectionSpec.CLEARTEXT))

        if (debugLogging) {
            builder.addInterceptor(loggingInterceptor)
        }
        customizer?.invoke(builder)
        return builder.build()
    }
}
