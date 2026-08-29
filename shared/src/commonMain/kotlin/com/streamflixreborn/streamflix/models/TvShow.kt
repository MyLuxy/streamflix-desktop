package com.streamflixreborn.streamflix.models

data class TvShow(
    override val id: String = "",
    override val title: String = "",
    val overview: String? = null,
    val released: String? = null,
    val runtime: Int? = null,
    val trailer: String? = null,
    val quality: String? = null,
    val rating: Double? = null,
    val poster: String? = null,
    val banner: String? = null,
    val logo: String? = null,
    val imdbId: String? = null,
    val providerName: String? = null,
    val seasons: List<Season> = listOf(),
    val genres: List<Genre> = listOf(),
    val directors: List<People> = listOf(),
    val cast: List<People> = listOf(),
    val recommendations: List<Show> = listOf(),
) : Show
