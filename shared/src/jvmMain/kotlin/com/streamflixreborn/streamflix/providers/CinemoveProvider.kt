package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.Show
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.MimeTypes
import com.streamflixreborn.streamflix.utils.TMDb3
import com.streamflixreborn.streamflix.utils.TMDb3.original
import com.streamflixreborn.streamflix.utils.TMDb3.w500
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Url
import java.util.concurrent.TimeUnit

// cinemove is a themed frontend over TMDb (its own ids ARE tmdb ids) plus a same-origin resolver
// backend: POST /api/play streams ndjson "start"/"miss"/"hit" events while it tries a handful of
// internal source names (videasy, nextbox, ...) server-side and stops at the first working one,
// handing back a same-origin /media-proxy?t=... hls url - both that endpoint and /media-proxy
// 403 without a same-site Origin/Referer, so we always send those. metadata comes straight from
// tmdb (same as this site's own client does, its api key is public in the bundle) since cinemove's
// own /browse route opts out of SSR and only hydrates client-side
object CinemoveProvider : Provider {

    override val name = "Cinemove"
    override val baseUrl = "https://cinemove.cc"
    override val language = "en"
    override val logo = "$baseUrl/favicon.ico"

    private const val UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    private val client = OkHttpClient.Builder()
        .dns(DnsResolver.doh)
        .readTimeout(60, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("User-Agent", UA)
                    .build()
            )
        }
        .build()

    private val service = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(JsoupConverterFactory.create())
        .build()
        .create(Service::class.java)

    private interface Service {
        @GET
        suspend fun getPage(@Url url: String): Document
    }

    private fun TMDb3.Movie.toShow(): Movie = Movie(
        id = id.toString(),
        title = title,
        overview = overview,
        released = releaseDate,
        rating = voteAverage.toDouble(),
        poster = posterPath?.w500,
        banner = backdropPath?.original,
    )

    private fun TMDb3.Tv.toShow(): TvShow = TvShow(
        id = id.toString(),
        title = name,
        overview = overview,
        released = firstAirDate,
        rating = voteAverage.toDouble(),
        poster = posterPath?.w500,
        banner = backdropPath?.original,
    )

    private fun TMDb3.MultiItem.toShow(): Show? = when (this) {
        is TMDb3.Movie -> toShow()
        is TMDb3.Tv -> toShow()
        else -> null
    }

    private fun parseCard(a: Element): Show? {
        val href = a.attr("href")
        val img = a.selectFirst("img") ?: return null
        val title = img.attr("alt").trim().ifEmpty { return null }
        val poster = img.attr("src").ifBlank { null }
        return when {
            href.startsWith("/movie/") -> Movie(id = href.removePrefix("/movie/"), title = title, poster = poster)
            href.startsWith("/show/") -> TvShow(id = href.removePrefix("/show/"), title = title, poster = poster)
            else -> null
        }
    }

    override suspend fun getHome(): List<Category> {
        val document = service.getPage(baseUrl)

        return document.select("h2").mapNotNull { heading ->
            val name = heading.text().trim().ifEmpty { return@mapNotNull null }
            val section = heading.closest("section") ?: return@mapNotNull null
            val items = section.select("a.media-card").mapNotNull { parseCard(it) }.distinctBy { it.id }
            if (items.isEmpty()) null else Category(name = name, list = items)
        }.distinctBy { it.name }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()

            return listOf(
                TMDb3.Genres.movieList(),
                TMDb3.Genres.tvList(),
            ).flatMap { it.genres }
                .distinctBy { it.id }
                .sortedBy { it.name }
                .map { Genre(id = it.id.toString(), name = it.name) }
        }

        return TMDb3.Search.multi(query, page = page).results.mapNotNull { it.toShow() }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        return TMDb3.MovieLists.popular(page = page).results.map { it.toShow() }
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        return TMDb3.TvSeriesLists.popular(page = page).results.map { it.toShow() }
    }

    override suspend fun getMovie(id: String): Movie {
        val details = TMDb3.Movies.details(
            movieId = id.toInt(),
            appendToResponse = listOf(
                TMDb3.Params.AppendToResponse.Movie.CREDITS,
                TMDb3.Params.AppendToResponse.Movie.RECOMMENDATIONS,
                TMDb3.Params.AppendToResponse.Movie.VIDEOS,
                TMDb3.Params.AppendToResponse.Movie.EXTERNAL_IDS,
            ),
        )

        return Movie(
            id = details.id.toString(),
            title = details.title,
            overview = details.overview,
            released = details.releaseDate,
            runtime = details.runtime,
            trailer = details.videos?.results
                ?.sortedBy { it.publishedAt ?: "" }
                ?.firstOrNull { it.site == TMDb3.Video.VideoSite.YOUTUBE }
                ?.let { "https://www.youtube.com/watch?v=${it.key}" },
            rating = details.voteAverage.toDouble(),
            poster = details.posterPath?.original,
            banner = details.backdropPath?.original,
            imdbId = details.externalIds?.imdbId,
            genres = details.genres.map { Genre(it.id.toString(), it.name) },
            cast = details.credits?.cast?.map { People(id = it.id.toString(), name = it.name, image = it.profilePath?.w500) } ?: listOf(),
            recommendations = details.recommendations?.results?.mapNotNull { it.toShow() } ?: listOf(),
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val details = TMDb3.TvSeries.details(
            seriesId = id.toInt(),
            appendToResponse = listOf(
                TMDb3.Params.AppendToResponse.Tv.CREDITS,
                TMDb3.Params.AppendToResponse.Tv.RECOMMENDATIONS,
                TMDb3.Params.AppendToResponse.Tv.VIDEOS,
                TMDb3.Params.AppendToResponse.Tv.EXTERNAL_IDS,
            ),
        )

        return TvShow(
            id = details.id.toString(),
            title = details.name,
            overview = details.overview,
            released = details.firstAirDate,
            trailer = details.videos?.results
                ?.sortedBy { it.publishedAt ?: "" }
                ?.firstOrNull { it.site == TMDb3.Video.VideoSite.YOUTUBE }
                ?.let { "https://www.youtube.com/watch?v=${it.key}" },
            rating = details.voteAverage.toDouble(),
            poster = details.posterPath?.original,
            banner = details.backdropPath?.original,
            imdbId = details.externalIds?.imdbId,
            seasons = details.seasons.map {
                Season(
                    id = "${details.id}-${it.seasonNumber}",
                    number = it.seasonNumber,
                    title = it.name,
                    poster = it.posterPath?.w500,
                )
            },
            genres = details.genres.map { Genre(it.id.toString(), it.name) },
            cast = details.credits?.cast?.map { People(id = it.id.toString(), name = it.name, image = it.profilePath?.w500) } ?: listOf(),
            recommendations = details.recommendations?.results?.mapNotNull { it.toShow() } ?: listOf(),
        )
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val (tvShowId, seasonNumber) = seasonId.split("-").let { it[0] to it[1].toInt() }

        return TMDb3.TvSeasons.details(
            seriesId = tvShowId.toInt(),
            seasonNumber = seasonNumber,
        ).episodes?.map {
            Episode(
                id = it.id.toString(),
                number = it.episodeNumber,
                title = it.name ?: "",
                released = it.airDate,
                poster = it.stillPath?.w500,
                overview = it.overview,
            )
        } ?: listOf()
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        fun <T> List<T>.mix(other: List<T>): List<T> = sequence {
            val first = iterator()
            val second = other.iterator()
            while (first.hasNext() && second.hasNext()) {
                yield(first.next())
                yield(second.next())
            }
            yieldAll(first)
            yieldAll(second)
        }.toList()

        val movies = TMDb3.Discover.movie(page = page, withGenres = TMDb3.Params.WithBuilder(id)).results.map { it.toShow() }
        val shows = TMDb3.Discover.tv(page = page, withGenres = TMDb3.Params.WithBuilder(id)).results.map { it.toShow() }

        return Genre(id = id, name = "", shows = movies.mix(shows))
    }

    override suspend fun getPeople(id: String, page: Int): People {
        val details = TMDb3.People.details(
            personId = id.toInt(),
            appendToResponse = listOfNotNull(
                if (page > 1) null else TMDb3.Params.AppendToResponse.Person.COMBINED_CREDITS,
            ),
        )

        return People(
            id = details.id.toString(),
            name = details.name,
            image = details.profilePath?.w500,
            biography = details.biography,
            placeOfBirth = details.placeOfBirth,
            birthday = details.birthday,
            deathday = details.deathday,
            filmography = details.combinedCredits?.cast
                ?.mapNotNull { it.toShow() }
                ?.sortedBy { show -> if (show is Movie) show.released else (show as TvShow).released }
                ?.reversed()
                ?: listOf(),
        )
    }

    private data class PlayParams(
        val tmdbId: String,
        val mediaType: String,
        val title: String,
        val year: Int?,
        val imdbId: String?,
        val season: Int?,
        val episode: Int?,
    )

    private fun playParams(videoType: Video.Type): PlayParams = when (videoType) {
        is Video.Type.Movie -> PlayParams(
            tmdbId = videoType.id,
            mediaType = "movie",
            title = videoType.title,
            year = videoType.releaseDate.take(4).toIntOrNull(),
            imdbId = videoType.imdbId,
            season = null,
            episode = null,
        )

        is Video.Type.Episode -> PlayParams(
            tmdbId = videoType.tvShow.id,
            mediaType = "tv",
            title = videoType.tvShow.title,
            year = videoType.tvShow.releaseDate?.take(4)?.toIntOrNull(),
            imdbId = videoType.tvShow.imdbId,
            season = videoType.season.number,
            episode = videoType.number,
        )
    }

    // the site's own player streams this as ndjson (one json object per line: start/miss/hit/done)
    // while the backend tries its source list itself and stops at the first hit - so one POST is
    // all we need, no separate per-source calls
    private suspend fun resolvePlayback(params: PlayParams): Pair<String, String>? = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("tmdbId", params.tmdbId)
            put("mediaType", params.mediaType)
            put("title", params.title)
            params.year?.let { put("year", it) }
            params.imdbId?.let { put("imdbId", it) }
            params.season?.let { put("season", it) }
            params.episode?.let { put("episode", it) }
            put("depth", "warm")
        }.toString().toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("$baseUrl/api/play")
            .header("Origin", baseUrl)
            .header("Referer", "$baseUrl/")
            .header("Content-Type", "application/json")
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext null
            val reader = response.body?.charStream()?.buffered() ?: return@withContext null

            while (true) {
                val line = reader.readLine() ?: break
                val trimmed = line.trim()
                if (trimmed.isEmpty()) continue

                val event = runCatching { JSONObject(trimmed) }.getOrNull() ?: continue
                if (event.optString("type") != "hit") continue

                val data = event.optJSONObject("data") ?: continue
                val url = data.optString("playlist").ifBlank { data.optString("url") }
                if (url.isNotBlank()) {
                    return@withContext event.optString("sourceId").ifBlank { "cinemove" } to url
                }
            }

            null
        }
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val (sourceId, playlistUrl) = resolvePlayback(playParams(videoType)) ?: return emptyList()
        return listOf(Video.Server(id = playlistUrl, name = "Cinemove ($sourceId)", src = playlistUrl))
    }

    override suspend fun getVideo(server: Video.Server): Video {
        return Video(
            source = server.src.ifBlank { server.id },
            headers = mapOf(
                "Referer" to "$baseUrl/",
                "User-Agent" to UA,
            ),
            type = MimeTypes.APPLICATION_M3U8,
        )
    }
}
