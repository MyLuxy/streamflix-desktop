package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.ListItem
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.Show
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.MimeTypes
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object AnimeXProvider : Provider {

    override val baseUrl = "https://animex.one"
    override val name = "AnimeX"
    override val logo = "$baseUrl/icons/ios/180.png"
    override val language = "en"

    private const val GRAPHQL_URL = "https://graphql.animex.one/graphql"
    private const val REST_URL = "https://pp.animex.one/rest/api"
    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    // the rest api checks for a same-site fetch fingerprint, a plain request needs these spoofed in
    private fun get(url: String): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Sec-Fetch-Site", "same-site")
            .header("Sec-Fetch-Mode", "cors")
            .header("Sec-Fetch-Dest", "empty")
            .header("Origin", baseUrl)
            .header("Referer", "$baseUrl/")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("HTTP ${response.code} for $url")
            return response.body?.string().orEmpty()
        }
    }

    private fun graphql(query: String, variables: JSONObject): JSONObject {
        val payload = JSONObject().put("query", query).put("variables", variables)
        val body = payload.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url(GRAPHQL_URL)
            .header("User-Agent", USER_AGENT)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .post(body)
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("GraphQL HTTP ${response.code}")
            val json = JSONObject(response.body?.string().orEmpty())
            val errors = json.optJSONArray("errors")
            if (errors != null && errors.length() > 0) {
                throw Exception("GraphQL error: ${errors.optJSONObject(0)?.optString("message")}")
            }
            return json.getJSONObject("data")
        }
    }

    private const val CATALOG_QUERY = """
        query(${'$'}filter: AnimeCatalogFilterInput, ${'$'}sort: [AnimeSortInput!], ${'$'}limit: Int, ${'$'}offset: Int) {
          catalogAnime(filter: ${'$'}filter, sort: ${'$'}sort, limit: ${'$'}limit, offset: ${'$'}offset) {
            items {
              id titleRomaji titleEnglish coverImage bannerImage description
              format averageScore episodeCount seasonYear genres
            }
          }
        }
    """

    private fun catalogQuery(filter: JSONObject, sort: String = "POPULARITY", limit: Int = 30, offset: Int = 0): JSONArray {
        val variables = JSONObject()
            .put("filter", filter)
            .put("sort", JSONArray().put(JSONObject().put("field", sort).put("direction", "DESC")))
            .put("limit", limit)
            .put("offset", offset)
        return graphql(CATALOG_QUERY, variables).getJSONObject("catalogAnime").getJSONArray("items")
    }

    private fun JSONArray.toListItems(): List<ListItem> = (0 until length()).map { getJSONObject(it).toListItem() }

    private fun JSONObject.toGenres(): List<Genre> =
        optJSONArray("genres")?.let { arr -> (0 until arr.length()).map { Genre(id = arr.getString(it), name = arr.getString(it)) } }
            ?: emptyList()

    private fun JSONObject.animeTitle(): String = optString("titleEnglish").ifBlank { optString("titleRomaji") }

    private fun JSONObject.animePoster(): String? = optJSONObject("coverImage")?.optString("large")?.takeIf { it.isNotBlank() }

    private fun JSONObject.animeOverview(): String? = optString("description").takeIf { it.isNotBlank() }?.let { stripHtml(it) }

    private fun JSONObject.animeRating(): Double? = if (has("averageScore") && !isNull("averageScore")) optInt("averageScore") / 10.0 else null

    private fun JSONObject.animeReleased(): String? = if (has("seasonYear") && !isNull("seasonYear")) optInt("seasonYear").toString() else null

    private fun stripHtml(text: String) = text
        .replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
        .replace(Regex("<[^>]+>"), "")
        .trim()

    private fun JSONObject.toListItem(): ListItem {
        val id = getString("id")
        return if (optString("format") == "MOVIE") {
            Movie(
                id = id, title = animeTitle(), overview = animeOverview(), poster = animePoster(),
                banner = optString("bannerImage").takeIf { it.isNotBlank() }, rating = animeRating(),
                released = animeReleased(), genres = toGenres(),
            )
        } else {
            TvShow(
                id = id, title = animeTitle(), overview = animeOverview(), poster = animePoster(),
                banner = optString("bannerImage").takeIf { it.isNotBlank() }, rating = animeRating(),
                released = animeReleased(), genres = toGenres(),
            )
        }
    }

    // AniList's own genre list, not a per-site invention, so it lines up with what catalogAnime.genres actually returns
    private val ALL_GENRES = listOf(
        "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo",
        "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
        "Sports", "Supernatural", "Thriller",
    )
    private val HOME_GENRES = listOf("Action", "Fantasy", "Romance", "Comedy", "Supernatural")
    private val NON_MOVIE_FORMATS = JSONArray(listOf("TV", "TV_SHORT", "OVA", "ONA", "SPECIAL"))

    override suspend fun getHome(): List<Category> {
        val categories = mutableListOf<Category>()

        val trending = catalogQuery(JSONObject().put("includeAdult", false), sort = "TRENDING", limit = 20).toListItems()
        if (trending.isNotEmpty()) categories.add(Category(name = Category.FEATURED, list = trending))

        val updated = catalogQuery(JSONObject().put("includeAdult", false), sort = "UPDATED_AT", limit = 20).toListItems()
        if (updated.isNotEmpty()) categories.add(Category(name = "Recently Updated", list = updated))

        HOME_GENRES.forEach { genre ->
            val shows = runCatching {
                catalogQuery(
                    JSONObject().put("includeAdult", false).put("genres", JSONArray(listOf(genre))),
                    sort = "POPULARITY", limit = 20,
                ).toListItems()
            }.getOrDefault(emptyList())
            if (shows.isNotEmpty()) categories.add(Category(name = genre, list = shows))
        }

        return categories
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            if (page > 1) return emptyList()
            return ALL_GENRES.map { Genre(id = it, name = it) }
        }
        if (page > 1) return emptyList()

        return catalogQuery(JSONObject().put("query", query).put("includeAdult", false), limit = 30).toListItems()
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val offset = (page - 1).coerceAtLeast(0) * 30
        return catalogQuery(
            JSONObject().put("formatIn", JSONArray(listOf("MOVIE"))).put("includeAdult", false),
            limit = 30, offset = offset,
        ).toListItems().filterIsInstance<Movie>()
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val offset = (page - 1).coerceAtLeast(0) * 30
        return catalogQuery(
            JSONObject().put("formatIn", NON_MOVIE_FORMATS).put("includeAdult", false),
            limit = 30, offset = offset,
        ).toListItems().filterIsInstance<TvShow>()
    }

    private fun fetchAnime(id: String): JSONObject {
        val items = catalogQuery(JSONObject().put("ids", JSONArray(listOf(id))), limit = 1)
        if (items.length() == 0) throw Exception("Anime not found: $id")
        return items.getJSONObject(0)
    }

    override suspend fun getMovie(id: String): Movie {
        val item = fetchAnime(id)
        return Movie(
            id = id, title = item.animeTitle(), overview = item.animeOverview(), poster = item.animePoster(),
            banner = item.optString("bannerImage").takeIf { it.isNotBlank() }, rating = item.animeRating(),
            released = item.animeReleased(), genres = item.toGenres(),
        )
    }

    override suspend fun getTvShow(id: String): TvShow {
        val item = fetchAnime(id)
        val episodes = if (item.optInt("episodeCount", 0) > 0) fetchEpisodes(id) else emptyList()
        return TvShow(
            id = id, title = item.animeTitle(), overview = item.animeOverview(), poster = item.animePoster(),
            banner = item.optString("bannerImage").takeIf { it.isNotBlank() }, rating = item.animeRating(),
            released = item.animeReleased(), genres = item.toGenres(),
            seasons = if (episodes.isNotEmpty()) listOf(Season(id = id, number = 1, episodes = episodes)) else emptyList(),
        )
    }

    private fun fetchEpisodes(animeId: String): List<Episode> {
        val episodes = JSONArray(get("$REST_URL/episodes?id=$animeId"))
        return (0 until episodes.length()).mapNotNull { i ->
            val ep = episodes.getJSONObject(i)
            val number = ep.optInt("number", -1).takeIf { it > 0 } ?: return@mapNotNull null
            Episode(
                id = "$animeId#$number",
                number = number,
                title = ep.optJSONObject("titles")?.optString("en")?.takeIf { it.isNotBlank() } ?: "Episode $number",
                poster = ep.optString("img").takeIf { it.isNotBlank() },
                overview = ep.optString("description").takeIf { it.isNotBlank() },
            )
        }
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> = fetchEpisodes(seasonId)

    override suspend fun getGenre(id: String, page: Int): Genre {
        val offset = (page - 1).coerceAtLeast(0) * 30
        val shows = runCatching {
            catalogQuery(
                JSONObject().put("genres", JSONArray(listOf(id))).put("includeAdult", false),
                limit = 30, offset = offset,
            ).toListItems().filterIsInstance<Show>()
        }.getOrDefault(emptyList())
        return Genre(id = id, name = id, shows = shows)
    }

    override suspend fun getPeople(id: String, page: Int): People = throw Exception("People not supported")

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val (animeId, epNum) = when (videoType) {
            is Video.Type.Movie -> id to 1
            is Video.Type.Episode -> id.substringBefore('#') to (id.substringAfter('#').toIntOrNull() ?: 1)
        }

        val json = JSONObject(get("$REST_URL/servers?id=$animeId&epNum=$epNum"))
        val servers = mutableListOf<Video.Server>()

        fun addProviders(key: String, label: String) {
            json.optJSONArray(key)?.let { arr ->
                for (i in 0 until arr.length()) {
                    val providerId = arr.getJSONObject(i).getString("id")
                    servers.add(
                        Video.Server(
                            id = "$label:$providerId:$animeId:$epNum",
                            name = "$label - ${providerId.replaceFirstChar { it.uppercase() }}",
                        )
                    )
                }
            }
        }
        addProviders("subProviders", "Sub")
        addProviders("dubProviders", "Dub")

        return servers
    }

    override suspend fun getVideo(server: Video.Server): Video {
        val (type, providerId, animeId, epNum) = server.id.split(":", limit = 4)

        val json = JSONObject(get("$REST_URL/sources?id=$animeId&epNum=$epNum&type=${type.lowercase()}&providerId=$providerId"))
        val sources = json.optJSONArray("sources")
        if (sources == null || sources.length() == 0) throw Exception("No sources returned")
        val source = sources.getJSONObject(0)
        val sourceUrl = source.getString("url")
        val isHls = source.optString("type").contains("mpegurl", ignoreCase = true)

        val headers = json.optJSONObject("headers")?.let { h ->
            h.keys().asSequence().associateWith { k -> h.getString(k) }
        } ?: emptyMap()

        val subtitles = json.optJSONArray("tracks")?.let { arr ->
            (0 until arr.length()).mapNotNull { i ->
                val track = arr.getJSONObject(i)
                if (track.optString("kind") != "captions") return@mapNotNull null
                Video.Subtitle(
                    label = track.optString("label").ifBlank { "Subtitle" },
                    file = track.getString("url"),
                    default = track.optBoolean("default"),
                )
            }
        } ?: emptyList()

        return Video(
            source = sourceUrl,
            subtitles = subtitles,
            headers = headers,
            type = if (isHls) MimeTypes.APPLICATION_M3U8 else null,
        )
    }
}
