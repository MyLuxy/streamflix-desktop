package com.streamflixreborn.streamflix.utils

import com.streamflixreborn.streamflix.models.TvShow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// desktop stand-in for the Room-backed TvShowDao a couple of providers (AniWorld, SerienStream)
// use for local caching - no persistence across runs, just the in-memory subset those providers
// actually call. Real local persistence (SQLDelight) is a separate piece of work, not this pass.
class InMemoryTvShowCache {

    private val shows = mutableListOf<TvShow>()
    private val state = MutableStateFlow<List<TvShow>>(emptyList())

    @Synchronized
    fun getAllIds(): List<String> = shows.map { it.id }

    @Synchronized
    fun insertAll(tvShows: List<TvShow>) {
        shows.addAll(tvShows)
        state.value = shows.toList()
    }

    fun getAll(): StateFlow<List<TvShow>> = state

    @Synchronized
    fun searchTvShows(query: String, limit: Int, offset: Int): List<TvShow> {
        return shows
            .filter { it.title.contains(query, ignoreCase = true) }
            .drop(offset)
            .take(limit)
    }
}
