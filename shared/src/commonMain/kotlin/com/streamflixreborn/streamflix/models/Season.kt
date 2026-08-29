package com.streamflixreborn.streamflix.models

data class Season(
    val id: String = "",
    val number: Int = 0,
    val title: String? = null,
    val poster: String? = null,
    val episodes: List<Episode> = listOf(),
) : ListItem
