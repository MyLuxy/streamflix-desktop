package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.utils.Log

import com.streamflixreborn.streamflix.models.*
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.HeadlessBrowserResolver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

// viv.st's own /tmdb/* endpoint is a straight passthrough of the real TMDB v3 API (same params,
// same response shape), so the data classes below only pick out the fields we actually use.
// playback goes through a separate SSE endpoint (/api/es) that races several upstream mirrors
// server-side and streams each one's result back as it resolves.
object VivariumProvider : Provider {

    override val name = "Vivarium"
    override val baseUrl = "https://viv.st"
    override val logo = "$baseUrl/icon-512.png"
    override val language = "en"
    private const val TAG = "VivariumProvider"

    private const val CDN_BASE = "https://t1.vivarium.wtf/tmdb"
    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .dns(DnsResolver.doh)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    // /api/es requires a same-site Referer, and this is the only piece of state getVideo needs
    // back from getServers - keying by the stream url itself avoids a bigger request-scoped object
    private val subsCache = ConcurrentHashMap<String, List<Video.Subtitle>>()

    @Serializable
    private data class TmdbListItem(
        val id: Int,
        val media_type: String? = null,
        val title: String? = null,
        val name: String? = null,
        val poster_path: String? = null,
        val backdrop_path: String? = null,
        val release_date: String? = null,
        val first_air_date: String? = null,
        val vote_average: Double? = null,
        val overview: String? = null,
    )

    @Serializable
    private data class TmdbListResponse(val results: List<TmdbListItem> = emptyList())

    @Serializable
    private data class TmdbGenre(val id: Int, val name: String)

    @Serializable
    private data class TmdbCastMember(val id: Int, val name: String = "", val profile_path: String? = null)

    @Serializable
    private data class TmdbCredits(val cast: List<TmdbCastMember> = emptyList())

    @Serializable
    private data class TmdbVideoEntry(val site: String? = null, val type: String? = null, val key: String? = null)

    @Serializable
    private data class TmdbVideos(val results: List<TmdbVideoEntry> = emptyList())

    @Serializable
    private data class TmdbExternalIds(val imdb_id: String? = null)

    @Serializable
    private data class TmdbSeasonSummary(val season_number: Int, val name: String? = null, val poster_path: String? = null)

    @Serializable
    private data class TmdbDetail(
        val id: Int,
        val title: String? = null,
        val name: String? = null,
        val overview: String? = null,
        val poster_path: String? = null,
        val backdrop_path: String? = null,
        val release_date: String? = null,
        val first_air_date: String? = null,
        val runtime: Int? = null,
        val episode_run_time: List<Int> = emptyList(),
        val vote_average: Double? = null,
        val genres: List<TmdbGenre> = emptyList(),
        val credits: TmdbCredits? = null,
        val videos: TmdbVideos? = null,
        val external_ids: TmdbExternalIds? = null,
        val seasons: List<TmdbSeasonSummary> = emptyList(),
    )

    @Serializable
    private data class TmdbEpisode(
        val episode_number: Int,
        val name: String? = null,
        val overview: String? = null,
        val still_path: String? = null,
        val air_date: String? = null,
    )

    @Serializable
    private data class TmdbSeasonDetail(val episodes: List<TmdbEpisode> = emptyList())

    @Serializable
    private data class EsSub(val url: String, val lang: String? = null, val label: String? = null)

    @Serializable
    private data class EsStream(
        val url: String,
        val quality: String? = null,
        val type: String? = null,
        val subs: List<EsSub> = emptyList(),
    )

    @Serializable
    private data class EsSourceEvent(val provider: String, val streams: List<EsStream> = emptyList())

    private suspend inline fun <reified T> getTmdb(path: String, params: Map<String, String> = emptyMap()): T? {
        return try {
            val url = "$CDN_BASE$path".toHttpUrlOrNull()?.newBuilder()
                ?.apply { params.forEach { (k, v) -> addQueryParameter(k, v) } }
                ?.build() ?: return null

            val body = withContext(Dispatchers.IO) {
                client.newCall(
                    Request.Builder().url(url)
                        .header("User-Agent", USER_AGENT)
                        .header("Referer", "$baseUrl/")
                        .header("Origin", baseUrl)
                        .build()
                ).execute().use { it.body?.string() }
            } ?: return null

            json.decodeFromString<T>(body)
        } catch (e: Exception) {
            Log.e(TAG, "getTmdb error for $path: ${e.message}", e)
            null
        }
    }

    private fun tmdbImage(path: String?, size: String = "w500"): String? =
        path?.takeIf { it.isNotBlank() }?.let { "https://image.tmdb.org/t/p/$size$it" }

    private fun itemToShow(item: TmdbListItem): Show? {
        val kind = item.media_type ?: if (item.first_air_date != null) "tv" else "movie"
        return when (kind) {
            "movie" -> Movie(
                id = "movie/${item.id}",
                title = item.title ?: item.name ?: "",
                overview = item.overview,
                released = item.release_date,
                rating = item.vote_average,
                poster = tmdbImage(item.poster_path),
                banner = tmdbImage(item.backdrop_path, "original"),
            )
            "tv" -> TvShow(
                id = "tv/${item.id}",
                title = item.name ?: item.title ?: "",
                overview = item.overview,
                released = item.first_air_date,
                rating = item.vote_average,
                poster = tmdbImage(item.poster_path),
                banner = tmdbImage(item.backdrop_path, "original"),
            )
            else -> null
        }
    }

    private fun kindAndId(id: String): Pair<String, String> {
        val parts = id.split("/")
        return parts[0] to parts[1]
    }

    override suspend fun getHome(): List<Category> {
        val sections = listOf(
            Triple("Trending Today", "/trending/all/day", emptyMap()),
            Triple("Trending This Week", "/trending/all/week", emptyMap()),
            Triple("Popular Movies", "/discover/movie", mapOf("sort_by" to "popularity.desc")),
            Triple("Popular TV Shows", "/discover/tv", mapOf("sort_by" to "popularity.desc")),
            Triple("Top Rated Movies", "/discover/movie", mapOf("sort_by" to "vote_average.desc", "vote_count.gte" to "1000")),
            Triple("Top Rated TV Shows", "/discover/tv", mapOf("sort_by" to "vote_average.desc", "vote_count.gte" to "1000")),
        )

        return sections.mapNotNull { (label, path, params) ->
            getTmdb<TmdbListResponse>(path, params)
                ?.results
                ?.mapNotNull(::itemToShow)
                ?.takeIf { it.isNotEmpty() }
                ?.let { Category(name = label, list = it) }
        }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return getTmdb<GenreListResponse>("/genre/movie/list")
                ?.genres
                ?.map { Genre(id = it.id.toString(), name = it.name) }
                .orEmpty()
        }

        return getTmdb<TmdbListResponse>("/search/multi", mapOf("query" to query, "page" to page.toString()))
            ?.results
            ?.mapNotNull(::itemToShow)
            .orEmpty()
    }

    @Serializable
    private data class GenreListResponse(val genres: List<TmdbGenre> = emptyList())

    override suspend fun getMovies(page: Int): List<Movie> =
        getTmdb<TmdbListResponse>("/discover/movie", mapOf("sort_by" to "popularity.desc", "page" to page.toString()))
            ?.results
            ?.mapNotNull { itemToShow(it.copy(media_type = "movie")) as? Movie }
            .orEmpty()

    override suspend fun getTvShows(page: Int): List<TvShow> =
        getTmdb<TmdbListResponse>("/discover/tv", mapOf("sort_by" to "popularity.desc", "page" to page.toString()))
            ?.results
            ?.mapNotNull { itemToShow(it.copy(media_type = "tv")) as? TvShow }
            .orEmpty()

    override suspend fun getMovie(id: String): Movie {
        val (_, tmdbId) = kindAndId(id)
        val d = getTmdb<TmdbDetail>("/movie/$tmdbId", mapOf("append_to_response" to "credits,videos,external_ids"))
            ?: throw Exception("Movie not found")

        return Movie(
            id = id,
            title = d.title ?: "",
            overview = d.overview,
            released = d.release_date,
            runtime = d.runtime,
            trailer = d.videos?.results?.firstOrNull { it.site == "YouTube" }?.key?.let { "https://www.youtube.com/watch?v=$it" },
            rating = d.vote_average,
            poster = tmdbImage(d.poster_path),
            banner = tmdbImage(d.backdrop_path, "original"),
            imdbId = d.external_ids?.imdb_id,
            genres = d.genres.map { Genre(id = it.id.toString(), name = it.name) },
            cast = d.credits?.cast.orEmpty().map { People(id = it.id.toString(), name = it.name, image = tmdbImage(it.profile_path)) },
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val (_, tmdbId) = kindAndId(id)
        val d = getTmdb<TmdbDetail>("/tv/$tmdbId", mapOf("append_to_response" to "credits,videos,external_ids"))
            ?: throw Exception("TV show not found")

        return TvShow(
            id = id,
            title = d.name ?: "",
            overview = d.overview,
            released = d.first_air_date,
            runtime = d.episode_run_time.firstOrNull(),
            trailer = d.videos?.results?.firstOrNull { it.site == "YouTube" }?.key?.let { "https://www.youtube.com/watch?v=$it" },
            rating = d.vote_average,
            poster = tmdbImage(d.poster_path),
            banner = tmdbImage(d.backdrop_path, "original"),
            imdbId = d.external_ids?.imdb_id,
            genres = d.genres.map { Genre(id = it.id.toString(), name = it.name) },
            cast = d.credits?.cast.orEmpty().map { People(id = it.id.toString(), name = it.name, image = tmdbImage(it.profile_path)) },
            seasons = d.seasons.filter { it.season_number > 0 }.map {
                Season(id = "$id/${it.season_number}", number = it.season_number, title = it.name, poster = tmdbImage(it.poster_path))
            },
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val parts = seasonId.split("/")
        val (kind, tmdbId, seasonNumber) = Triple(parts[0], parts[1], parts[2])

        return getTmdb<TmdbSeasonDetail>("/$kind/$tmdbId/season/$seasonNumber")
            ?.episodes
            ?.map { ep ->
                Episode(
                    id = "$kind/$tmdbId/$seasonNumber/${ep.episode_number}",
                    number = ep.episode_number,
                    title = ep.name,
                    overview = ep.overview,
                    released = ep.air_date,
                    poster = tmdbImage(ep.still_path),
                )
            }
            .orEmpty()
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        val shows = getTmdb<TmdbListResponse>("/discover/movie", mapOf("with_genres" to id, "sort_by" to "popularity.desc", "page" to page.toString()))
            ?.results?.mapNotNull { itemToShow(it.copy(media_type = "movie")) }.orEmpty()
        val genreName = getTmdb<GenreListResponse>("/genre/movie/list")?.genres?.find { it.id.toString() == id }?.name ?: id
        return Genre(id = id, name = genreName, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("People are not available on Vivarium.")
    }

    private fun parseEsEvents(sse: String): List<EsSourceEvent> {
        return sse.split("\n\n").mapNotNull { block ->
            val lines = block.split("\n")
            val eventLine = lines.firstOrNull { it.startsWith("event:") } ?: return@mapNotNull null
            if (eventLine.removePrefix("event:").trim() != "source") return@mapNotNull null
            val dataLine = lines.firstOrNull { it.startsWith("data:") }?.removePrefix("data:")?.trim() ?: return@mapNotNull null
            runCatching { json.decodeFromString<EsSourceEvent>(dataLine) }.getOrNull()
        }
    }

    // /api/es sits behind Cloudflare bot management that blocks plain OkHttp/curl requests
    // outright (no header combination gets past it, verified) - only a real browser TLS
    // fingerprint clears it, so this rides the watch page's own fetch instead of calling the
    // endpoint directly. Single shared instance so concurrent lookups share its mutex.
    private val browserResolver = HeadlessBrowserResolver()

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val watchUrl = when (videoType) {
            is Video.Type.Movie -> {
                val (_, tmdbId) = kindAndId(id)
                "$baseUrl/m/x-$tmdbId?w=1"
            }
            is Video.Type.Episode -> {
                val (_, tmdbId) = kindAndId(videoType.tvShow.id)
                "$baseUrl/s/x-$tmdbId?w=1&s=${videoType.season.number}&e=${videoType.number}"
            }
        }

        val body = try {
            browserResolver.waitForResponseBody(
                url = watchUrl,
                timeoutMs = 30_000L,
                predicate = { it.contains("/api/es") },
            ) ?: return emptyList()
        } catch (e: Exception) {
            Log.e(TAG, "getServers error: ${e.message}", e)
            return emptyList()
        }

        return parseEsEvents(body).flatMap { source ->
            source.streams.map { stream ->
                subsCache[stream.url] = stream.subs.mapNotNull { sub ->
                    Video.Subtitle(label = sub.label ?: sub.lang ?: "Subtitle", file = sub.url)
                }
                val label = if (stream.quality.isNullOrBlank() || stream.quality == "Auto") source.provider else "${source.provider} ${stream.quality}"
                Video.Server(id = stream.url, name = label, src = stream.url)
            }
        }
    }

    override suspend fun getVideo(server: Video.Server): Video = Video(
        source = server.src,
        subtitles = subsCache[server.src].orEmpty(),
        headers = mapOf("Referer" to "$baseUrl/"),
        type = com.streamflixreborn.streamflix.utils.MimeTypes.APPLICATION_M3U8,
    )
}
