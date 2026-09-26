package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.utils.Log

import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.*
import com.streamflixreborn.streamflix.utils.DnsResolver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

// same white-label template/backend as CuevanaEuProvider (identical siteConfig.playerProvider and
// api bundle), just a different domain skin - keeping it as a separate provider gives a fallback
// if one of the two domains gets blocked, even though the catalog is identical
object FanpelisProvider : Provider {

    override val name = "Fanpelis"
    override val baseUrl = "https://fanpelis.to"
    override val logo: String get() = "$baseUrl/favicon.ico"
    override val language = "es"
    private const val TAG = "FanpelisProvider"

    private const val API_BASE = "https://tmdb.allcalidad.re"
    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .dns(DnsResolver.doh)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class ApiRef(val id: Int? = null, val slug: String? = null, val title: String = "")

    @Serializable
    private data class ApiPerson(val id: Int = 0, val name: String = "", val profile_path: String? = null)

    @Serializable
    private data class ApiSeasonSummary(val season: Int, val name: String? = null, val poster_path: String? = null)

    // covers both list cards and the fuller single-item payload, unused fields just default out
    @Serializable
    private data class ApiShow(
        val tmdb_id: Int,
        val kind: String,
        val code: String? = null,
        val title: String = "",
        val poster_path: String? = null,
        val backdrop_path: String? = null,
        val year: Int? = null,
        val runtime: Int? = null,
        val vote_average: Double? = null,
        val overview: String? = null,
        val release_date: String? = null,
        val first_air_date: String? = null,
        val imdb_id: String? = null,
        val trailer_youtube_key: String? = null,
        val genres: List<ApiRef> = emptyList(),
        val cast: List<ApiPerson> = emptyList(),
        val episode_seasons: List<ApiSeasonSummary> = emptyList(),
    )

    @Serializable
    private data class ApiEpisode(
        val season: Int,
        val episode: Int,
        val title: String? = null,
        val overview: String? = null,
        val air_date: String? = null,
        val still_path: String? = null,
        val code: String? = null,
    )

    @Serializable
    private data class ApiSeasonDetail(val season: Int, val episodes: List<ApiEpisode> = emptyList())

    @Serializable
    private data class ItemsEnvelope(val items: List<ApiShow> = emptyList())

    @Serializable
    private data class ItemEnvelope(val item: ApiShow)

    @Serializable
    private data class SeasonEnvelope(val season: ApiSeasonDetail)

    @Serializable
    private data class EpisodeEnvelope(val episode: ApiEpisode)

    @Serializable
    private data class TaxonomyEnvelope(val items: List<ApiRef> = emptyList())

    private suspend inline fun <reified T> getApi(path: String, params: Map<String, String> = emptyMap()): T? {
        return try {
            val url = "$API_BASE$path".toHttpUrlOrNull()?.newBuilder()
                ?.apply { params.forEach { (k, v) -> addQueryParameter(k, v) } }
                ?.build() ?: return null

            val body = withContext(Dispatchers.IO) {
                client.newCall(Request.Builder().url(url).header("User-Agent", USER_AGENT).build())
                    .execute().use { it.body?.string() }
            } ?: return null

            json.decodeFromString<T>(body)
        } catch (e: Exception) {
            Log.e(TAG, "getApi error for $path: ${e.message}", e)
            null
        }
    }

    private fun tmdbImage(path: String?, size: String = "w500"): String? =
        path?.takeIf { it.isNotBlank() }?.let { "https://image.tmdb.org/t/p/$size$it" }

    // "movie/603" or "tvshow/1399" / "anime/1399" - one slash, always kind then tmdb id
    private fun kindAndId(id: String): Pair<String, String> {
        val parts = id.split("/")
        return parts[0] to parts[1]
    }

    private fun apiShowToShow(show: ApiShow): Show? = when (show.kind) {
        "movie" -> apiShowToMovie(show)
        "tvshow", "anime" -> apiShowToTvShow(show)
        else -> null
    }

    private fun apiShowToMovie(show: ApiShow): Movie = Movie(
        id = "movie/${show.tmdb_id}",
        title = show.title,
        overview = show.overview,
        released = show.release_date ?: show.year?.toString(),
        runtime = show.runtime,
        trailer = show.trailer_youtube_key?.let { "https://www.youtube.com/watch?v=$it" },
        rating = show.vote_average,
        poster = tmdbImage(show.poster_path),
        banner = tmdbImage(show.backdrop_path, "original"),
        imdbId = show.imdb_id,
        genres = show.genres.mapNotNull { it.slug?.let { slug -> Genre(id = slug, name = it.title) } },
        cast = show.cast.map { People(id = it.id.toString(), name = it.name, image = tmdbImage(it.profile_path)) },
    )

    private fun apiShowToTvShow(show: ApiShow): TvShow = TvShow(
        id = "${show.kind}/${show.tmdb_id}",
        title = show.title,
        overview = show.overview,
        released = show.first_air_date ?: show.year?.toString(),
        runtime = show.runtime,
        trailer = show.trailer_youtube_key?.let { "https://www.youtube.com/watch?v=$it" },
        rating = show.vote_average,
        poster = tmdbImage(show.poster_path),
        banner = tmdbImage(show.backdrop_path, "original"),
        imdbId = show.imdb_id,
        genres = show.genres.mapNotNull { it.slug?.let { slug -> Genre(id = slug, name = it.title) } },
        cast = show.cast.map { People(id = it.id.toString(), name = it.name, image = tmdbImage(it.profile_path)) },
        seasons = show.episode_seasons.map {
            Season(
                id = "${show.kind}/${show.tmdb_id}/${it.season}",
                number = it.season,
                title = it.name,
                poster = tmdbImage(it.poster_path),
            )
        },
    )

    override suspend fun getHome(): List<Category> {
        val sections = listOf(
            Triple("Tendencias", "/v1/top", emptyMap()),
            Triple("Últimas Películas", "/v1/items", mapOf("kind" to "movie", "sort" to "recent")),
            Triple("Últimas Series", "/v1/items", mapOf("kind" to "tvshow", "sort" to "recent")),
            Triple("Anime", "/v1/items", mapOf("kind" to "anime", "sort" to "recent")),
            Triple("Mejor Valoradas", "/v1/items", mapOf("sort" to "rating")),
        )

        return sections.mapNotNull { (name, path, params) ->
            getApi<ItemsEnvelope>(path, params + mapOf("page" to "1", "limit" to "20"))
                ?.items
                ?.mapNotNull(::apiShowToShow)
                ?.takeIf { it.isNotEmpty() }
                ?.let { Category(name = name, list = it) }
        }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return getApi<TaxonomyEnvelope>("/v1/taxonomies/genre")
                ?.items
                ?.mapNotNull { it.slug?.let { slug -> Genre(id = slug, name = it.title) } }
                .orEmpty()
        }

        return getApi<ItemsEnvelope>("/v1/search", mapOf("q" to query, "page" to page.toString(), "limit" to "24"))
            ?.items
            ?.mapNotNull(::apiShowToShow)
            .orEmpty()
    }

    override suspend fun getMovies(page: Int): List<Movie> =
        getApi<ItemsEnvelope>("/v1/items", mapOf("kind" to "movie", "sort" to "recent", "page" to page.toString(), "limit" to "24"))
            ?.items
            ?.map(::apiShowToMovie)
            .orEmpty()

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val tvShows = getApi<ItemsEnvelope>("/v1/items", mapOf("kind" to "tvshow", "sort" to "recent", "page" to page.toString(), "limit" to "24"))
            ?.items?.map(::apiShowToTvShow).orEmpty()
        val anime = getApi<ItemsEnvelope>("/v1/items", mapOf("kind" to "anime", "sort" to "recent", "page" to page.toString(), "limit" to "24"))
            ?.items?.map(::apiShowToTvShow).orEmpty()
        return (tvShows + anime).distinctBy { it.id }
    }

    override suspend fun getMovie(id: String): Movie {
        val (kind, tmdbId) = kindAndId(id)
        val show = getApi<ItemEnvelope>("/v1/items/$kind/$tmdbId")?.item
            ?: throw Exception("Movie not found")

        val recommendations = getApi<ItemsEnvelope>("/v1/items/$kind/$tmdbId/related", mapOf("limit" to "12"))
            ?.items?.mapNotNull(::apiShowToShow).orEmpty()

        return apiShowToMovie(show).copy(recommendations = recommendations)
    }

    override suspend fun getTvShow(id: String): TvShow {
        val (kind, tmdbId) = kindAndId(id)
        val show = getApi<ItemEnvelope>("/v1/items/$kind/$tmdbId")?.item
            ?: throw Exception("TV show not found")

        val recommendations = getApi<ItemsEnvelope>("/v1/items/$kind/$tmdbId/related", mapOf("limit" to "12"))
            ?.items?.mapNotNull(::apiShowToShow).orEmpty()

        return apiShowToTvShow(show).copy(recommendations = recommendations)
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val parts = seasonId.split("/")
        val (kind, tmdbId, seasonNumber) = Triple(parts[0], parts[1], parts[2])

        return getApi<SeasonEnvelope>("/v1/items/$kind/$tmdbId/seasons/$seasonNumber")
            ?.season?.episodes
            ?.sortedBy { it.episode }
            ?.map { ep ->
                Episode(
                    id = "$kind/$tmdbId/${ep.season}/${ep.episode}",
                    number = ep.episode,
                    title = ep.title,
                    overview = ep.overview,
                    released = ep.air_date,
                    poster = tmdbImage(ep.still_path),
                )
            }
            .orEmpty()
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        val shows = getApi<ItemsEnvelope>("/v1/items", mapOf("genre" to id, "page" to page.toString(), "limit" to "24"))
            ?.items?.mapNotNull(::apiShowToShow).orEmpty()
        return Genre(id = id, name = id.replaceFirstChar { it.uppercaseChar() }, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("Esta función no está disponible en Fanpelis.")
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val code = when (videoType) {
            is Video.Type.Movie -> {
                val (kind, tmdbId) = kindAndId(id)
                getApi<ItemEnvelope>("/v1/items/$kind/$tmdbId")?.item?.code
            }
            is Video.Type.Episode -> {
                val (kind, tmdbId) = kindAndId(videoType.tvShow.id)
                getApi<EpisodeEnvelope>("/v1/items/$kind/$tmdbId/seasons/${videoType.season.number}/episodes/${videoType.number}")
                    ?.episode?.code
            }
        } ?: return emptyList()

        return listOf(Video.Server(id = code, name = "Vimeos", src = "https://vimeos.net/embed-$code.html"))
    }

    override suspend fun getVideo(server: Video.Server): Video = Extractor.extract(server.src, server)
}
