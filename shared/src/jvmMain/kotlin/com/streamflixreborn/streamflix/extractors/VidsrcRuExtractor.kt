package com.streamflixreborn.streamflix.extractors

import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.HeadlessBrowserResolver
import com.streamflixreborn.streamflix.utils.MimeTypes

class VidsrcRuExtractor : Extractor() {

    override val name = "Vidsrc.Ru"
    override val mainUrl = "https://vidsrc.ru"

    private val webViewResolver = HeadlessBrowserResolver()

    fun server(videoType: Video.Type): Video.Server {
        return Video.Server(
            id = name,
            name = name,
            src = when (videoType) {
                is Video.Type.Movie -> "$mainUrl/movie/${videoType.id}"
                is Video.Type.Episode -> "$mainUrl/tv/${videoType.tvShow.id}/${videoType.season.number}/${videoType.number}"
            },
        )
    }

    override suspend fun extract(link: String): Video {
        val url = webViewResolver.waitForRequestUrl(link) { it.contains("/file2/") && it.endsWith(".m3u8") }
            ?: throw Exception("Timeout waiting for VidsrcRu stream")

        return Video(
            source = url,
            subtitles = emptyList(),
            type = MimeTypes.APPLICATION_M3U8,
        )
    }
}
