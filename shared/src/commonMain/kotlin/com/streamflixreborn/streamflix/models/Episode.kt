package com.streamflixreborn.streamflix.models

data class Episode(
    val id: String = "",
    val number: Int = 0,
    val title: String? = null,
    val released: String? = null,
    val poster: String? = null,
    val overview: String? = null,
    val tvShow: TvShow? = null,
    val season: Season? = null,
) : ListItem
