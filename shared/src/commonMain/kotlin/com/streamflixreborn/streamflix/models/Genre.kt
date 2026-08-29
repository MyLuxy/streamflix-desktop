package com.streamflixreborn.streamflix.models

data class Genre(
    val id: String,
    val name: String,
    val shows: List<Show> = listOf(),
) : ListItem
