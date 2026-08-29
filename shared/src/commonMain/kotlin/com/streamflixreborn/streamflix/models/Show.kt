package com.streamflixreborn.streamflix.models

sealed interface Show : ListItem {
    val id: String
    val title: String
}
