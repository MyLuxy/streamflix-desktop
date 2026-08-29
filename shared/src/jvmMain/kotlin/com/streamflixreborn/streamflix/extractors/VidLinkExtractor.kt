package com.streamflixreborn.streamflix.extractors

import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.HeadlessBrowserResolver
import org.json.JSONObject

class VidLinkExtractor : Extractor() {

    override val name = "VidLink"
    override val mainUrl = "https://vidlink.pro"

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
        val body = webViewResolver.waitForResponseBody(link) { it.contains("/api/b/") }
            ?: throw Exception("Timeout waiting for stream")

        val json = JSONObject(body)
        if (!json.has("stream")) throw Exception("Stream data missing in response")
        val stream = json.getJSONObject("stream")
        val playlist = stream.optString("playlist")

        val captionsList = mutableListOf<Video.Subtitle>()
        val captions = stream.optJSONArray("captions")
        if (captions != null) {
            for (i in 0 until captions.length()) {
                val cap = captions.getJSONObject(i)
                val id = cap.optString("id")
                val lang = cap.optString("language")
                captionsList.add(Video.Subtitle(lang, id))
            }
        }

        return Video(
            source = playlist,
            subtitles = captionsList,
            headers = mapOf("Referer" to mainUrl),
        )
    }
}
