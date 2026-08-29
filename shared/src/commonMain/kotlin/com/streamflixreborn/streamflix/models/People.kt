package com.streamflixreborn.streamflix.models

data class People(
    val id: String,
    val name: String,
    val image: String? = null,
    val biography: String? = null,
    val placeOfBirth: String? = null,
    val birthday: String? = null,
    val deathday: String? = null,
    val filmography: List<Show> = listOf(),
) : ListItem
