package com.streamflixreborn.streamflix.desktop

import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.Show
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.providers.IptvProvider
import com.streamflixreborn.streamflix.providers.Provider
import com.sun.net.httpserver.HttpExchange
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.util.concurrent.ConcurrentLinkedDeque
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

@Serializable
data class DebugEvent(val id: Long, val timestamp: Long, val level: String, val category: String, val message: String)

// simple pub/sub log bus so the settings debug terminal can tail whatever the backend is doing live
object DebugLog {
    private val nextId = AtomicLong(0)
    private val backlog = ConcurrentLinkedDeque<DebugEvent>()
    private val listeners = CopyOnWriteArrayList<(DebugEvent) -> Unit>()
    private const val MAX_BACKLOG = 300

    private fun push(level: String, category: String, message: String) {
        val event = DebugEvent(nextId.incrementAndGet(), System.currentTimeMillis(), level, category, message)
        backlog.addLast(event)
        while (backlog.size > MAX_BACKLOG) backlog.pollFirst()
        listeners.forEach { it(event) }
    }

    fun info(category: String, message: String) = push("info", category, message)
    fun success(category: String, message: String) = push("success", category, message)
    fun warn(category: String, message: String) = push("warn", category, message)
    fun error(category: String, message: String) = push("error", category, message)

    fun snapshot(): List<DebugEvent> = backlog.toList()

    // returns an unsubscribe function, call it once the client disconnects
    fun subscribe(listener: (DebugEvent) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }
}

fun handleDebugStream(exchange: HttpExchange) {
    exchange.responseHeaders.add("Content-Type", "text/event-stream")
    exchange.responseHeaders.add("Cache-Control", "no-cache")
    exchange.sendResponseHeaders(200, 0)
    val out = exchange.responseBody

    fun send(event: DebugEvent) {
        out.write("data: ${json.encodeToString(event)}\n\n".toByteArray())
        out.flush()
    }

    try {
        DebugLog.snapshot().forEach(::send)
        val unsubscribe = DebugLog.subscribe { event -> runCatching { send(event) } }
        try {
            // parks this thread on the cached pool until the client goes away, a periodic comment line keeps it from idling out
            while (true) {
                Thread.sleep(15_000)
                out.write(": ping\n\n".toByteArray())
                out.flush()
            }
        } finally {
            unsubscribe()
        }
    } catch (e: Exception) {
        // client closed the connection, nothing else to clean up
    } finally {
        runCatching { exchange.close() }
    }
}

// tries this many of the provider's own home items before giving up on it
private const val MAX_CHECK_ITEMS = 5

private val providerCheckRunning = AtomicBoolean(false)
private val providerCheckCancelled = AtomicBoolean(false)

// returns false if one was already running, in which case nothing new was started
private fun startProviderCheck(): Boolean {
    if (!providerCheckRunning.compareAndSet(false, true)) return false
    providerCheckCancelled.set(false)
    Thread {
        try {
            runProviderCheck()
        } finally {
            providerCheckRunning.set(false)
        }
    }.start()
    return true
}

fun handleDebugCheckProviders(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    if (!startProviderCheck()) return sendJson(exchange, 409, """{"error":"a check is already running"}""")
    sendJson(exchange, 200, """{"success":true}""")
}

// skips live tv (theres no single "video" to resolve) and providers already known/hidden as broken
private fun checkableProviders(): List<Provider> =
    Provider.providers.keys
        .filter { it !is IptvProvider && it.name !in HIDDEN_PROVIDERS }
        .sortedBy { it.name.lowercase() }

private class ProviderCheckCancelledException : Exception("cancelled")

// tests against whatever the provider's own home page shows right now, not a fixed title a niche catalog may never have
private fun checkOneProvider(provider: Provider): Boolean {
    val items = runBlocking { provider.getHome() }
        .flatMap { it.list }
        .filterIsInstance<Show>()
        .distinctBy { it.id }
        .take(MAX_CHECK_ITEMS)
    if (items.isEmpty()) error("home page has no content to test")

    var lastError: Throwable? = null
    var tried = 0
    for (item in items) {
        // checked between titles too, not just between providers, so a slow one doesnt sit on ctrl+c for long
        if (providerCheckCancelled.get()) throw ProviderCheckCancelledException()
        tried++
        val type = when (item) {
            is Movie -> "movie"
            is TvShow -> "tv"
        }
        val result = runCatching { resolveVideoBlocking(provider, StreamRequest(provider.name, item.id, type)) }
        if (result.getOrNull()?.first?.source?.isNotBlank() == true) return true
        lastError = result.exceptionOrNull()?.let { if (it is StreamResolutionLoggedException) it.cause else it }
    }
    // the tried count matters as much as the error itself, "5/5 failed" vs "1/5" reads very differently
    val detail = lastError?.describe() ?: "no source returned"
    throw Exception("$tried/${items.size} title(s) tried, last failure: $detail")
}

private fun runProviderCheck() {
    val providers = checkableProviders()
    DebugLog.info("providercheck", "checking ${providers.size} providers, one at a time (ctrl+c to cancel)")
    val failed = mutableListOf<String>()
    var okCount = 0
    var checked = 0
    for (provider in providers) {
        if (providerCheckCancelled.get()) {
            DebugLog.warn("providercheck", "cancelled after $checked/${providers.size}")
            return
        }
        DebugLog.info("providercheck", "checking ${provider.name}")
        val result = runCatching { checkOneProvider(provider) }
        if (result.exceptionOrNull() is ProviderCheckCancelledException) {
            DebugLog.warn("providercheck", "cancelled after $checked/${providers.size}")
            return
        }
        checked++
        if (result.getOrDefault(false)) {
            okCount++
            DebugLog.success("providercheck", "${provider.name} works")
        } else {
            failed.add(provider.name)
            val reason = result.exceptionOrNull()?.describe() ?: "no working stream found"
            DebugLog.error("providercheck", "${provider.name}: $reason")
        }
    }
    DebugLog.info("providercheck", "done: $okCount/${providers.size} working")
    if (failed.isNotEmpty()) DebugLog.warn("providercheck", "not working: ${failed.joinToString(", ")}")
}

private val backendStartTime = System.currentTimeMillis()

fun handleDebugCancel(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    if (!providerCheckRunning.get()) return sendJson(exchange, 200, """{"success":false,"error":"nothing running"}""")
    providerCheckCancelled.set(true)
    sendJson(exchange, 200, """{"success":true}""")
}

@Serializable
data class DebugCommandRequest(val command: String)

fun handleDebugCommand(exchange: HttpExchange) {
    if (exchange.requestMethod != "POST") return sendJson(exchange, 405, """{"error":"POST required"}""")
    val body = exchange.requestBody.use { it.readBytes().decodeToString() }
    val request = runCatching { json.decodeFromString<DebugCommandRequest>(body) }.getOrNull()
        ?: return sendJson(exchange, 400, """{"error":"invalid body"}""")
    sendJson(exchange, 200, """{"success":true}""")
    Thread { runDebugCommand(request.command) }.start()
}

// a small fixed set of terminal-style debug commands, typed into the debug terminal's own input
private fun runDebugCommand(raw: String) {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return
    DebugLog.info("cmd", "$ $trimmed")
    when (trimmed.substringBefore(' ').lowercase()) {
        "help" -> DebugLog.info("cmd", "commands: help, providers, check-providers, cancel, gc, uptime")
        "providers" -> {
            val summary = Provider.providers.entries.sortedBy { it.key.name.lowercase() }.joinToString(", ") { (p, s) ->
                val tags = listOfNotNull(
                    "movies".takeIf { s.movies },
                    "tv".takeIf { s.tvShows },
                    "iptv".takeIf { p is IptvProvider },
                ).joinToString("+")
                "${p.name}($tags)"
            }
            DebugLog.info("cmd", "${Provider.providers.size} registered: $summary")
        }
        "check-providers" -> if (!startProviderCheck()) DebugLog.warn("cmd", "a check is already running")
        "cancel" -> {
            if (providerCheckRunning.get()) {
                providerCheckCancelled.set(true)
                DebugLog.info("cmd", "cancelling...")
            } else {
                DebugLog.warn("cmd", "nothing to cancel")
            }
        }
        "gc" -> {
            val rt = Runtime.getRuntime()
            val before = (rt.totalMemory() - rt.freeMemory()) / 1_000_000
            System.gc()
            val after = (rt.totalMemory() - rt.freeMemory()) / 1_000_000
            DebugLog.info("cmd", "heap ${before}MB -> ${after}MB after gc (max ${rt.maxMemory() / 1_000_000}MB)")
        }
        "uptime" -> {
            val secs = (System.currentTimeMillis() - backendStartTime) / 1000
            DebugLog.info("cmd", "backend up for ${secs / 60}m ${secs % 60}s")
        }
        else -> DebugLog.error("cmd", "unknown command: $trimmed (try 'help')")
    }
}
