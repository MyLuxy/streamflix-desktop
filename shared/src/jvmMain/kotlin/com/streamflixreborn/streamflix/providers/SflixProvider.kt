package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.extractors.VixSrcExtractor
import com.streamflixreborn.streamflix.models.Video

// ssflix.pro is just a tmdb frontend now, so this rides TmdbProvider("en") for the whole catalog
object SflixProvider : Provider by TmdbProvider("en") {

    override val baseUrl = "https://ssflix.pro"
    override val name = "SFlix"
    override val logo = "https://ssflix.pro/icon/android-chrome-512x512.png"

    // the other tmdb-id extractors are all dead right now, VixSrc is the only one that still works
    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        return listOf(VixSrcExtractor().server(videoType))
    }
}
