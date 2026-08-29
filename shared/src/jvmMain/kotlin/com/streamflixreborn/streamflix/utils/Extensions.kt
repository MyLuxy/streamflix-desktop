package com.streamflixreborn.streamflix.utils

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

fun String.toCalendar(): Calendar? {
    val patterns = listOf(
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ENGLISH),
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm'Z'", Locale.ENGLISH),
        SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH),
        SimpleDateFormat("d MMMM yyyy ('USA')", Locale.ENGLISH),
        SimpleDateFormat("d MMMM yyyy", Locale.FRENCH),
        SimpleDateFormat("yyyy", Locale.ENGLISH),
        SimpleDateFormat("MMM d, yyyy", Locale.ENGLISH),
        SimpleDateFormat("MMMM d, yyyy ('United' 'States')", Locale.ENGLISH),
        SimpleDateFormat("MMM. d, yyyy", Locale.ENGLISH),
    )
    patterns.forEach { sdf ->
        try {
            return Calendar.getInstance().also { it.time = sdf.parse(this)!! }
        } catch (_: Exception) {
        }
    }
    return null
}

fun Calendar.format(pattern: String): String? {
    return try {
        SimpleDateFormat(pattern, Locale.getDefault()).format(this.time)
    } catch (e: Exception) {
        null
    }
}

fun <K, V> Map<K, V?>.filterNotNullValues() = filterValues { it != null } as Map<K, V>

suspend fun <T> retry(retries: Int, predicate: suspend (attempt: Int) -> T): T {
    require(retries > 0) { "Expected positive amount of retries, but had $retries" }
    var throwable: Throwable? = null
    (1..retries).forEach { attempt ->
        try {
            return predicate(attempt)
        } catch (e: Throwable) {
            throwable = e
        }
    }
    throw throwable!!
}

fun <T> List<T>.safeSubList(fromIndex: Int, toIndex: Int): List<T> {
    if (fromIndex > toIndex) return emptyList()
    return subList(
        maxOf(minOf(fromIndex.coerceAtLeast(0), size), 0),
        maxOf(minOf(toIndex.coerceAtMost(size), size), 0)
    )
}
