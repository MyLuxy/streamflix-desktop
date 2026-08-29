package com.streamflixreborn.streamflix.models

data class Video(
    val source: String,
    val subtitles: List<Subtitle> = listOf(),
    val headers: Map<String, String>? = null,
    val type: String? = null,
    val extraBuffering: Boolean = false,
    val useServerSubtitleSetting: Boolean = false,
    val maintainToken: Boolean = false,
) {

    sealed class Type {
        data class Movie(
            val id: String,
            val title: String,
            val releaseDate: String,
            val poster: String,
            val imdbId: String?,
        ) : Type()

        data class Episode(
            val id: String,
            val number: Int,
            val title: String?,
            val poster: String?,
            val overview: String?,
            val tvShow: TvShow,
            val season: Season,
        ) : Type() {
            data class TvShow(
                val id: String,
                val title: String,
                val poster: String?,
                val banner: String?,
                val releaseDate: String?,
                val imdbId: String?,
            )

            data class Season(
                val number: Int,
                val title: String?,
            )
        }
    }

    data class Subtitle(
        val label: String,
        val file: String,
        var default: Boolean = false,
        val initialDefault: Boolean = false,
    )

    data class Server(
        val id: String,
        val name: String,
        val src: String = "",
    ) {
        var video: Video? = null
    }
}
