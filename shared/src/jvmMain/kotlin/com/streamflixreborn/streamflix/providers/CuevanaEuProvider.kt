package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.utils.Log

import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.*
import com.streamflixreborn.streamflix.utils.DnsResolver
import com.streamflixreborn.streamflix.utils.UserPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

// wordpress site over its own json api (siteConfig.fastApi in the page), video links sit behind player.php wrappers
object CuevanaEuProvider : Provider {

    override val name = "Cuevana 3"
    override val baseUrl: String get() = "https://${UserPreferences.cuevanaDomain}"
    override val logo: String get() = "$baseUrl/favicon.ico"
    override val language = "es"
    private const val TAG = "CuevanaEuProvider"

    private val apiBase: String get() = "$baseUrl/wp-api/v1"
    private val uploadsBase: String get() = "$baseUrl/wp-content/uploads"
    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .dns(DnsResolver.doh)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    // posts only carry wordpress term ids, names come from siteConfig.datas.genres which is baked into the html
    private val GENRES = mapOf(
        26 to ("accion" to "Acción"), 253 to ("action-adventure" to "Action & Adventure"),
        53 to ("animacion" to "Animación"), 25 to ("aventura" to "Aventura"), 214 to ("belica" to "Bélica"),
        27 to ("ciencia-ficcion" to "Ciencia ficción"), 80 to ("comedia" to "Comedia"), 190 to ("crimen" to "Crimen"),
        8690 to ("documental" to "Documental"), 81 to ("drama" to "Drama"), 54 to ("familia" to "Familia"),
        163 to ("fantasia" to "Fantasía"), 680 to ("historia" to "Historia"), 251 to ("kids" to "Kids"),
        401 to ("misterio" to "Misterio"), 437 to ("musica" to "Música"), 7952 to ("pelicula-de-tv" to "Película de TV"),
        17547 to ("reality" to "Reality"), 82 to ("romance" to "Romance"), 252 to ("sci-fi-fantasy" to "Sci-Fi & Fantasy"),
        26793 to ("soap" to "Soap"), 345 to ("suspense" to "Suspense"), 1502 to ("terror" to "Terror"),
        1002 to ("war-politics" to "War & Politics"), 278 to ("western" to "Western"),
    )

    @Serializable
    private data class Envelope<T>(val error: Boolean = false, val message: String? = null, val data: T? = null)

    @Serializable
    private data class Images(val poster: String? = null, val backdrop: String? = null)

    @Serializable
    private data class Post(
        val _id: Int,
        val title: String = "",
        val overview: String? = null,
        val slug: String = "",
        val type: String = "",
        val images: Images? = null,
        val trailer: String? = null,
        val rating: String? = null,
        val genres: List<Int> = emptyList(),
        val release_date: String? = null,
        val runtime: String? = null,
        val poster: String? = null,
        val backdrop: String? = null,
    )

    @Serializable
    private data class Listing(val posts: List<Post> = emptyList())

    @Serializable
    private data class EpisodePost(
        val _id: Int,
        val title: String? = null,
        val overview: String? = null,
        val still_path: String? = null,
        val date: String? = null,
        val season_number: Int,
        val episode_number: Int,
    )

    @Serializable
    private data class Pagination(val last_page: Int = 1)

    // seasons isnt always an array, the site's own code falls back to season 1 when it isnt
    @Serializable
    private data class EpisodeListing(
        val posts: List<EpisodePost> = emptyList(),
        val seasons: JsonElement? = null,
        val pagination: Pagination? = null,
    )

    @Serializable
    private data class Embed(val url: String, val server: String? = null, val lang: String? = null, val quality: String? = null)

    @Serializable
    private data class Player(val embeds: List<Embed> = emptyList())

    private suspend fun fetch(url: String, referer: String? = null): String? = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).header("User-Agent", USER_AGENT)
            .apply { referer?.let { header("Referer", it) } }
            .build()
        client.newCall(request).execute().use { it.body?.string() }
    }

    private suspend inline fun <reified T> getApi(path: String, params: Map<String, String> = emptyMap()): T? {
        return try {
            val url = "$apiBase$path".toHttpUrlOrNull()?.newBuilder()
                ?.apply { params.forEach { (k, v) -> addQueryParameter(k, v) } }
                ?.build() ?: return null
            val body = fetch(url.toString()) ?: return null
            val envelope = json.decodeFromString<Envelope<T>>(body)
            if (envelope.error) {
                Log.e(TAG, "api error for $path: ${envelope.message}")
                null
            } else envelope.data
        } catch (e: Exception) {
            Log.e(TAG, "getApi error for $path: ${e.message}", e)
            null
        }
    }

    private fun image(uploadsPath: String?, tmdbPath: String?, tmdbSize: String): String? =
        uploadsPath?.takeIf { it.isNotBlank() }?.let { "$uploadsBase$it" }
            ?: tmdbPath?.takeIf { it.isNotBlank() }?.let { "https://image.tmdb.org/t/p/$tmdbSize$it" }

    // titles come as "Name (2026)", the year already lives in released and it breaks title matching in TmdbProvider
    private fun cleanTitle(title: String) = title.replace(Regex("""\s*\(\d{4}\)\s*$"""), "")

    private fun genresOf(post: Post) = post.genres.mapNotNull { id -> GENRES[id]?.let { (slug, name) -> Genre(id = slug, name = name) } }

    private fun runtimeOf(post: Post) = post.runtime?.toDoubleOrNull()?.toInt()?.takeIf { it > 0 }

    private fun trailerOf(post: Post) = post.trailer?.takeIf { it.isNotBlank() }?.let { "https://www.youtube.com/watch?v=$it" }

    private fun toMovie(post: Post) = Movie(
        id = "movies/${post.slug}",
        title = cleanTitle(post.title),
        overview = post.overview,
        released = post.release_date,
        runtime = runtimeOf(post),
        trailer = trailerOf(post),
        rating = post.rating?.toDoubleOrNull(),
        poster = image(post.images?.poster, post.poster, "w500"),
        banner = image(post.images?.backdrop, post.backdrop, "original"),
        genres = genresOf(post),
    )

    private fun toTvShow(post: Post, seasons: List<Season> = emptyList()) = TvShow(
        id = "${post.type}/${post.slug}",
        title = cleanTitle(post.title),
        overview = post.overview,
        released = post.release_date,
        runtime = runtimeOf(post),
        trailer = trailerOf(post),
        rating = post.rating?.toDoubleOrNull(),
        poster = image(post.images?.poster, post.poster, "w500"),
        banner = image(post.images?.backdrop, post.backdrop, "original"),
        genres = genresOf(post),
        seasons = seasons,
    )

    private fun toShow(post: Post): Show? = when (post.type) {
        "movies" -> toMovie(post)
        "tvshows", "animes" -> toTvShow(post)
        else -> null
    }

    private suspend fun listing(type: String, orderBy: String, page: Int, perPage: Int): List<Post> =
        getApi<Listing>(
            "/listing/$type",
            mapOf("page" to page.toString(), "orderBy" to orderBy, "order" to "desc", "postType" to type, "postsPerPage" to perPage.toString()),
        )?.posts.orEmpty()

    private suspend fun single(id: String): Post {
        val (type, slug) = id.split("/", limit = 2)
        return getApi<Post>("/single/$type", mapOf("slug" to slug, "postType" to type))
            ?: throw Exception("Not found")
    }

    private suspend fun episodePage(showId: Int, season: Int, page: Int): EpisodeListing? =
        getApi<EpisodeListing>(
            "/single/episodes/list",
            mapOf("_id" to showId.toString(), "season" to season.toString(), "page" to page.toString(), "postsPerPage" to "100"),
        )

    private suspend fun episodes(showId: Int, season: Int): List<EpisodePost> {
        val first = episodePage(showId, season, 1) ?: return emptyList()
        val rest = (2..(first.pagination?.last_page ?: 1)).flatMap { episodePage(showId, season, it)?.posts.orEmpty() }
        return (first.posts + rest).sortedBy { it.episode_number }
    }

    private suspend fun related(postId: Int): List<Show> =
        getApi<Listing>("/single/related", mapOf("postId" to postId.toString(), "page" to "1", "tab" to "connections", "postsPerPage" to "12"))
            ?.posts?.mapNotNull(::toShow).orEmpty()

    override suspend fun getHome(): List<Category> = coroutineScope {
        val sections = listOf(
            "Películas más vistas" to suspend { getApi<Listing>("/tops", mapOf("page" to "1", "postType" to "movies", "postsPerPage" to "20", "range" to "week"))?.posts.orEmpty() },
            "Series más vistas" to suspend { getApi<Listing>("/tops", mapOf("page" to "1", "postType" to "tvshows", "postsPerPage" to "20", "range" to "week"))?.posts.orEmpty() },
            "Estrenos" to suspend { listing("movies", "release_date", 1, 20) },
            "Últimas Películas" to suspend { listing("movies", "latest", 1, 20) },
            "Últimas Series" to suspend { listing("tvshows", "latest", 1, 20) },
            "Anime" to suspend { listing("animes", "latest", 1, 20) },
        )

        sections.map { (name, load) ->
            async {
                load().mapNotNull(::toShow).takeIf { it.isNotEmpty() }?.let { Category(name = name, list = it) }
            }
        }.awaitAll().filterNotNull()
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return GENRES.values.map { (slug, name) -> Genre(id = slug, name = name) }.sortedBy { it.name }
        }

        return getApi<Listing>("/search", mapOf("q" to query, "page" to page.toString(), "postType" to "any", "postsPerPage" to "24"))
            ?.posts?.mapNotNull(::toShow).orEmpty()
    }

    override suspend fun getMovies(page: Int): List<Movie> = listing("movies", "latest", page, 24).map(::toMovie)

    override suspend fun getTvShows(page: Int): List<TvShow> = coroutineScope {
        val tvShows = async { listing("tvshows", "latest", page, 24) }
        val anime = async { listing("animes", "latest", page, 24) }
        (tvShows.await() + anime.await()).map { toTvShow(it) }
    }

    override suspend fun getMovie(id: String): Movie {
        val post = single(id)
        return toMovie(post).copy(recommendations = related(post._id))
    }

    override suspend fun getTvShow(id: String): TvShow {
        val post = single(id)
        val seasonNumbers = (episodePage(post._id, 1, 1)?.seasons as? JsonArray)
            ?.mapNotNull { it.jsonPrimitive.content.toIntOrNull() }
            ?.sorted()
            ?.takeIf { it.isNotEmpty() }
            ?: listOf(1)
        val seasons = seasonNumbers.map { Season(id = "${post.type}/${post._id}/$it", number = it, title = "Temporada $it") }
        return toTvShow(post, seasons).copy(recommendations = related(post._id))
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val (_, showId, season) = seasonId.split("/")
        return episodes(showId.toInt(), season.toInt()).map { ep ->
            Episode(
                id = ep._id.toString(),
                number = ep.episode_number,
                title = "Episodio ${ep.episode_number}",
                overview = ep.overview,
                released = ep.date?.substringBefore(" "),
                poster = ep.still_path?.takeIf { it.isNotBlank() }?.let { "https://image.tmdb.org/t/p/w500$it" },
            )
        }
    }

    override suspend fun getGenre(id: String, page: Int): Genre {
        val shows = getApi<Listing>(
            "/taxonomies",
            mapOf("taxonomy" to "genres", "term" to id, "page" to page.toString(), "postType" to "any", "postsPerPage" to "24", "orderBy" to "latest", "order" to "desc"),
        )?.posts?.mapNotNull(::toShow).orEmpty()
        val name = GENRES.values.firstOrNull { it.first == id }?.second ?: id.replaceFirstChar { it.uppercaseChar() }
        return Genre(id = id, name = name, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("Esta función no está disponible en Cuevana 3.")
    }

    // TmdbProvider hands over the show id from search() instead of an episode id, so resolve the episode from it
    private suspend fun postIdFor(id: String, videoType: Video.Type): Int = when (videoType) {
        is Video.Type.Movie -> single(id)._id
        is Video.Type.Episode -> id.toIntOrNull() ?: run {
            val show = single(id)
            episodes(show._id, videoType.season.number).firstOrNull { it.episode_number == videoType.number }?._id
                ?: throw Exception("Episode not found")
        }
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val postId = postIdFor(id, videoType)
        val player = getApi<Player>("/player", mapOf("postId" to postId.toString(), "demo" to "0")) ?: return emptyList()

        return player.embeds.map { embed ->
            val host = embed.url.toHttpUrlOrNull()?.queryParameter("server") ?: embed.server.orEmpty()
            val label = listOfNotNull(host.replaceFirstChar { it.uppercaseChar() }, embed.lang, embed.quality)
                .filter { it.isNotBlank() }
                .joinToString(" · ")
            Video.Server(id = embed.url, name = label, src = embed.url)
        }
    }

    // player.php is just a page with the real host's embed in an iframe
    override suspend fun getVideo(server: Video.Server): Video {
        val html = fetch(server.src, referer = "$baseUrl/").orEmpty()
        val embed = Regex("""<iframe[^>]+src="([^"]+)"""").find(html)?.groupValues?.get(1)
            ?.takeIf { it.startsWith("http") }
            ?: throw Exception("No embed found in player page")
        return Extractor.extract(embed, server)
    }
}
