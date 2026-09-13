package com.streamflixreborn.streamflix.desktop

import com.sun.net.httpserver.HttpExchange
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.util.concurrent.ConcurrentLinkedDeque
import java.util.concurrent.CopyOnWriteArrayList
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
