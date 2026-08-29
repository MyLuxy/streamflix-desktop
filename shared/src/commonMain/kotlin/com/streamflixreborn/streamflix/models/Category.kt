package com.streamflixreborn.streamflix.models

data class Category(
    val name: String,
    val list: List<ListItem>,
) : ListItem {
    companion object {
        const val FEATURED = ""
        const val CONTINUE_WATCHING = "Continue Watching"
        const val RECENTLY_WATCHED = "Recently Watched"
        const val FAVORITE_MOVIES = "Favorite movies"
        const val FAVORITE_TV_SHOWS = "Favorite TV shows"
    }
}
