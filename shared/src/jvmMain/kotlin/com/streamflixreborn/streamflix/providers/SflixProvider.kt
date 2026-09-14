package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.extractors.VixSrcExtractor
import com.streamflixreborn.streamflix.models.Video

// ssflix.pro is a pure tmdb frontend now (catalog and metadata come straight from the tmdb api
// client-side, same api key exposed in its own js), and its own "servers" are just vidsrc-clone
// embeds keyed by tmdb id, so this rides on the already-proven TmdbProvider("en") engine for the
// whole catalog and only swaps branding plus the server list. ssflix's own mirrors (moviesapi.to,
// vidcore.net, vidfast.vc, embedmaster.link) have no extractor here, and the ones that do exist
// for this tmdb-id family are mostly dead right now (moviesapi.club has no dns, vidsrc.net's own
// page parsing is broken, videasy's backend isn't returning json) except VixSrc, which a full
// sweep (10 movies, 3 tv episodes) came back 13/13
object SflixProvider : Provider by TmdbProvider("en") {

    override val baseUrl = "https://ssflix.pro"
    override val name = "SFlix"
    override val logo = "https://ssflix.pro/icon/android-chrome-512x512.png"

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        return listOf(VixSrcExtractor().server(videoType))
    }
}
