package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.ListItem
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video

// TEMPORARY - lets the animesaturn.net fallback tier be selected and tested directly from the
// provider picker instead of only kicking in when animesaturn.ro is down. delete this file (and
// its Provider.kt registration) once it's been checked out - it's not meant to ship long-term,
// AnimeSaturn itself already falls back to .net on its own when needed
object AnimeSaturnNetTestProvider : Provider {
    override val name = "AnimeSaturn (.net test)"
    override val baseUrl = AnimeSaturnProvider.NET_DOMAIN
    override val logo = AnimeSaturnProvider.logo
    override val language = "it"

    override suspend fun getHome(): List<Category> = AnimeSaturnProvider.netGetHome()

    override suspend fun search(query: String, page: Int): List<ListItem> = emptyList()

    override suspend fun getGenre(id: String, page: Int): Genre = AnimeSaturnProvider.netGetGenre(id, page)

    override suspend fun getMovies(page: Int): List<Movie> = emptyList()

    override suspend fun getTvShows(page: Int): List<TvShow> {
        if (page > 1) return emptyList()
        return AnimeSaturnProvider.netGetHome().flatMap { it.list }.filterIsInstance<TvShow>()
    }

    override suspend fun getTvShow(id: String): TvShow = AnimeSaturnProvider.netGetTvShow(id)

    override suspend fun getMovie(id: String): Movie = throw Exception("Movies not supported")

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> = AnimeSaturnProvider.netGetEpisodes(seasonId)

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> = AnimeSaturnProvider.netGetServers(id)

    override suspend fun getPeople(id: String, page: Int): People = People(id = id, name = id)

    override suspend fun getVideo(server: Video.Server): Video =
        AnimeSaturnProvider.netGetVideo(server.id.removePrefix("netembed:"))
}
