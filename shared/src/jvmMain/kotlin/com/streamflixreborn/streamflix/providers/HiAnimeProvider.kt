package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.Category
import com.streamflixreborn.streamflix.models.Episode
import com.streamflixreborn.streamflix.models.Genre
import com.streamflixreborn.streamflix.models.Movie
import com.streamflixreborn.streamflix.models.People
import com.streamflixreborn.streamflix.models.Season
import com.streamflixreborn.streamflix.models.TvShow
import com.streamflixreborn.streamflix.models.Video
import com.streamflixreborn.streamflix.utils.DnsResolver
import okhttp3.OkHttpClient
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Url
import java.net.URL
import java.util.Base64
import java.util.concurrent.TimeUnit

object HiAnimeProvider : Provider {

    private const val URL = "https://hianime.cv/"
    override val baseUrl = URL
    override val name = "HiAnime"
    override val logo = "$URL/images/logo.png"
    override val language = "en"

    private val service = HiAnimeService.build()

    // hrefs end in a trailing slash now, keep the full path not just the last segment
    private fun pathOf(href: String?): String =
        href?.let { runCatching { URL(it).path.trim('/') }.getOrDefault("") } ?: ""

    private fun lastSegment(href: String?): String =
        href?.trimEnd('/')?.substringAfterLast('/') ?: ""

    // nonce and numeric anime id both only show up on a detail page, not the listing grids
    private fun contextFromDocument(document: Document): Pair<String, String>? {
        val html = document.outerHtml()
        val animeId = document.selectFirst("link[rel=shortlink]")
            ?.attr("href")?.substringAfterLast("p=") ?: ""
        val nonce = Regex(""""episode_nonce":"([^"]+)"""").find(html)?.groupValues?.get(1) ?: ""
        if (animeId.isBlank() || nonce.isBlank()) return null
        return animeId to nonce
    }

    private suspend fun fetchAnimeContext(urlPath: String): Pair<String, String> =
        contextFromDocument(service.getPage(urlPath)) ?: throw Exception("HiAnime anime context not found")

    // tucks the context into the id so episodes/servers skip fetching this page again
    private fun packContext(urlPath: String, context: Pair<String, String>?): String =
        if (context != null) "$urlPath::${context.first}::${context.second}" else urlPath

    private suspend fun resolveContext(packed: String): Pair<String, String> {
        val parts = packed.split("::")
        val animeId = parts.getOrNull(1)?.takeIf { it.isNotBlank() }
        val nonce = parts.getOrNull(2)?.takeIf { it.isNotBlank() }
        if (animeId != null && nonce != null) return animeId to nonce
        return fetchAnimeContext(parts[0])
    }

    private fun urlPathOf(packed: String) = packed.substringBefore("::")


    override suspend fun getHome(): List<Category> {
        val document = service.getHome()

        val categories = mutableListOf<Category>()

        categories.add(
            Category(
                name = Category.FEATURED,
                list = document.select("div#slider div.swiper-slide").map {
                    val id = pathOf(it.selectFirst("div.desi-buttons a")?.attr("href"))
                    val title = it.selectFirst("div.desi-head-title")
                        ?.text() ?: ""
                    val overview = it.selectFirst("div.desi-description")
                        ?.text()
                    val runtime = it.select("div.scd-item").firstOrNull { element ->
                        element.selectFirst("i.fa-clock") != null
                    }?.text()?.removeSuffix("m")?.toIntOrNull()
                    val quality = it.selectFirst("div.quality")
                        ?.text()
                    val banner = it.selectFirst("img.film-poster-img")
                        ?.attr("data-src")

                    val isMovie = it.select("div.scd-item").firstOrNull { element ->
                        element.selectFirst("i.fa-play-circle") != null
                    }?.text() == "Movie"

                    if (isMovie) {
                        Movie(
                            id = id,
                            title = title,
                            overview = overview,
                            runtime = runtime,
                            quality = quality,
                            banner = banner,
                        )
                    } else {
                        TvShow(
                            id = id,
                            title = title,
                            overview = overview,
                            runtime = runtime,
                            quality = quality,
                            banner = banner,

                            seasons = it.selectFirst("div.tick-sub")
                                ?.text()?.toIntOrNull()?.let { lastEpisode ->
                                    listOf(
                                        Season(
                                            id = id,
                                            number = 0,

                                            episodes = listOf(
                                                Episode(
                                                    id = "",
                                                    number = lastEpisode,
                                                )
                                            )
                                        )
                                    )
                                } ?: listOf(Season(id = id, number = 0)),
                        )
                    }
                },
            )
        )

        categories.addAll(
            document.select("div.anif-block").map { block ->
                Category(
                    name = block.selectFirst("div.anif-block-header")
                        ?.text() ?: "",
                    list = block.select("li").map {
                        val id = pathOf(it.selectFirst("a")?.attr("href"))
                        val title = it.selectFirst("h3.film-name")
                            ?.text() ?: ""
                        val poster = it.selectFirst("img.film-poster-img")
                            ?.attr("data-src")

                        val isMovie = it.select("div.fd-infor span.fdi-item")
                            .lastOrNull()
                            ?.text() == "Movie"

                        if (isMovie) {
                            Movie(
                                id = id,
                                title = title,
                                poster = poster,
                            )
                        } else {
                            TvShow(
                                id = id,
                                title = title,
                                poster = poster,

                                seasons = listOf(Season(id = id, number = 0)),
                            )
                        }
                    }
                )
            }
        )

        categories.addAll(
            document.select("section.block_area.block_area_home").mapNotNull { block ->
                val name = block.selectFirst("h2.cat-heading")
                    ?.text() ?: ""
                if (name == "Top Upcoming") return@mapNotNull null

                Category(
                    name = name,
                    list = block.select("div.flw-item").map {
                        val id = pathOf(it.selectFirst("a")?.attr("href"))
                        val title = it.selectFirst("h3.film-name")
                            ?.text() ?: ""
                        val runtime = it.selectFirst("div.fd-infor span.fdi-duration")
                            ?.text()?.removeSuffix("m")?.toIntOrNull()
                        val poster = it.selectFirst("img.film-poster-img")
                            ?.attr("data-src")

                        val isMovie = it.selectFirst("div.fd-infor span.fdi-item")
                            ?.text() == "Movie"

                        if (isMovie) {
                            Movie(
                                id = id,
                                title = title,
                                runtime = runtime,
                                poster = poster,
                            )
                        } else {
                            TvShow(
                                id = id,
                                title = title,
                                runtime = runtime,
                                poster = poster,

                                seasons = listOf(Season(id = id, number = 0)),
                            )
                        }
                    }
                )
            }
        )

        return categories
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isEmpty()) {
            val document = service.getHome()

            val genres = document.select("div#sidebar_subs_genre a.nav-link")
                .map {
                    Genre(
                        id = lastSegment(it.attr("href")),
                        name = it.text(),
                    )
                }
                .sortedBy { it.name }

            return genres
        }

        val document = service.getByUrl("${URL}?s=${java.net.URLEncoder.encode(query, "UTF-8")}&paged=$page")

        val results = document.select("div.flw-item").map {
            val id = pathOf(it.selectFirst("a")?.attr("href"))
            val title = it.selectFirst("h3.film-name")
                ?.text() ?: ""
            val runtime = it.selectFirst("span.fdi-duration")
                ?.text()?.removeSuffix("m")?.toIntOrNull()
            val poster = it.selectFirst("img.film-poster-img")
                ?.attr("data-src")

            val isMovie = it.selectFirst("div.fd-infor > span.fdi-item")
                ?.text() == "Movie"

            if (isMovie) {
                Movie(
                    id = id,
                    title = title,
                    runtime = runtime,
                    poster = poster,
                )
            } else {
                TvShow(
                    id = id,
                    title = title,
                    runtime = runtime,
                    poster = poster,
                )
            }
        }

        return results
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val document = service.getType("movie", page)

        val movies = document.select("div.flw-item").map {
            Movie(
                id = pathOf(it.selectFirst("a")?.attr("href")),
                title = it.selectFirst("h3.film-name")
                    ?.text() ?: "",
                overview = it.selectFirst("div.description")
                    ?.text(),
                runtime = it.selectFirst("span.fdi-duration")
                    ?.text()?.removeSuffix("m")?.toIntOrNull(),
                poster = it.selectFirst("img.film-poster-img")
                    ?.attr("data-src"),
            )
        }

        return movies
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val document = service.getType("tv", page)

        val tvShows = document.select("div.flw-item").map {
            val id = pathOf(it.selectFirst("a")?.attr("href"))
            TvShow(
                id = id,
                title = it.selectFirst("h3.film-name")
                    ?.text() ?: "",
                overview = it.selectFirst("div.description")
                    ?.text(),
                runtime = it.selectFirst("div.fd-infor span.fdi-duration")
                    ?.text()?.removeSuffix("m")?.toIntOrNull(),
                poster = it.selectFirst("img.film-poster-img")
                    ?.attr("data-src"),

                seasons = listOf(Season(id = id, number = 0)),
            )
        }

        return tvShows
    }


    override suspend fun getMovie(id: String): Movie {
        val document = service.getPage(id)

        val movie = Movie(
            id = id,
            title = document.selectFirst("div.anisc-detail h2.film-name")
                ?.text() ?: "",
            overview = document.selectFirst("div.anisc-detail div.film-description  > .text")
                ?.text(),
            released = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "Aired:" }
                ?.selectFirst("span.name")?.text()?.substringBefore(" to"),
            runtime = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "Duration:" }
                ?.selectFirst("span.name")?.text()?.let {
                    val hours = it.substringBefore("h").toIntOrNull() ?: 0
                    val minutes = it.substringAfter("h ").substringBefore("m").toIntOrNull() ?: 0
                    hours * 60 + minutes
                },
            trailer = document.select("section.block_area-promotions div.item")
                .firstOrNull { it.attr("data-src").contains("youtube") }
                ?.attr("data-src")?.substringAfterLast("/")
                ?.let { "https://www.youtube.com/watch?v=${it}" },
            rating = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "MAL Score:" }
                ?.selectFirst("span.name")?.text()?.toDoubleOrNull(),
            poster = document.selectFirst("div.anisc-poster img")
                ?.attr("src"),

            genres = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "Genres:" }
                ?.select("a")?.map {
                    Genre(
                        id = lastSegment(it.attr("href")),
                        name = it.text(),
                    )
                } ?: listOf(),
            // cast/people pages dont exist on the site anymore
            recommendations = document.select("section.block_area.block_area_home")
                .find { it.selectFirst("h2.cat-heading")?.text()?.startsWith("Recommended", ignoreCase = true) == true }
                ?.select("div.flw-item")?.map {
                    val showId = pathOf(it.selectFirst("a")?.attr("href"))
                    val showTitle = it.selectFirst("h3.film-name")
                        ?.text() ?: ""
                    val showRuntime = it.selectFirst("div.fd-infor span.fdi-duration")
                        ?.text()?.substringBefore("m")?.toIntOrNull()
                    val showPoster = it.selectFirst("img")
                        ?.attr("data-src")

                    val isMovie = it.selectFirst("div.fd-infor > span.fdi-item")
                        ?.text() == "Movie"

                    if (isMovie) {
                        Movie(
                            id = showId,
                            title = showTitle,
                            runtime = showRuntime,
                            poster = showPoster,
                        )
                    } else {
                        TvShow(
                            id = showId,
                            title = showTitle,
                            runtime = showRuntime,
                            poster = showPoster,
                        )
                    }
                } ?: listOf(),
        )

        return movie
    }


    override suspend fun getTvShow(id: String): TvShow {
        val document = service.getPage(id)

        val tvShow = TvShow(
            id = id,
            title = document.selectFirst("div.anisc-detail h2.film-name")
                ?.text() ?: "",
            overview = document.selectFirst("div.anisc-detail div.film-description  > .text")
                ?.text(),
            released = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "Aired:" }
                ?.selectFirst("span.name")?.text()?.substringBefore(" to"),
            runtime = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "Duration:" }
                ?.selectFirst("span.name")?.text()?.let {
                    val hours = it.substringBefore("h").toIntOrNull() ?: 0
                    val minutes = it.substringAfter("h ").substringBefore("m").toIntOrNull() ?: 0
                    hours * 60 + minutes
                },
            trailer = document.select("section.block_area-promotions div.item")
                .firstOrNull { it.attr("data-src").contains("youtube") }
                ?.attr("data-src")?.substringAfterLast("/")
                ?.let { "https://www.youtube.com/watch?v=${it}" },
            rating = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "MAL Score:" }
                ?.selectFirst("span.name")?.text()?.toDoubleOrNull(),
            poster = document.selectFirst("div.anisc-poster img")
                ?.attr("src"),

            seasons = listOf(
                Season(
                    id = packContext(id, contextFromDocument(document)),
                    number = 0,
                    title = "Episodes",
                )
            ),
            genres = document.select("div.anisc-info div.item")
                .find { it.selectFirst("span.item-head")?.text() == "Genres:" }
                ?.select("a")?.map {
                    Genre(
                        id = lastSegment(it.attr("href")),
                        name = it.text(),
                    )
                } ?: listOf(),
            recommendations = document.select("section.block_area.block_area_home")
                .find { it.selectFirst("h2.cat-heading")?.text()?.startsWith("Recommended", ignoreCase = true) == true }
                ?.select("div.flw-item")?.map {
                    val showId = pathOf(it.selectFirst("a")?.attr("href"))
                    val showTitle = it.selectFirst("h3.film-name")
                        ?.text() ?: ""
                    val showRuntime = it.selectFirst("div.fd-infor span.fdi-duration")
                        ?.text()?.substringBefore("m")?.toIntOrNull()
                    val showPoster = it.selectFirst("img")
                        ?.attr("data-src")

                    val isMovie = it.selectFirst("div.fd-infor > span.fdi-item")
                        ?.text() == "Movie"

                    if (isMovie) {
                        Movie(
                            id = showId,
                            title = showTitle,
                            runtime = showRuntime,
                            poster = showPoster,
                        )
                    } else {
                        TvShow(
                            id = showId,
                            title = showTitle,
                            runtime = showRuntime,
                            poster = showPoster,
                        )
                    }
                } ?: listOf(),
        )

        return tvShow
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val (animeId, nonce) = resolveContext(seasonId)
        val response = service.getEpisodeList(animeId = animeId, nonce = nonce)
        val urlPath = urlPathOf(seasonId)

        val episodes = Jsoup.parse(response.html).select("a.ssl-item.ep-item").map {
            Episode(
                // carrying the already-resolved context along so getServers reuses it too
                id = "${it.attr("data-id")}::$urlPath::$animeId::$nonce",
                number = it.attr("data-number").toIntOrNull() ?: 0,
                title = it.selectFirst("div.ep-name")
                    ?.text(),
            )
        }

        return episodes
    }


    override suspend fun getGenre(id: String, page: Int): Genre {
        val document = service.getGenreDoc(id, page)

        val genre = Genre(
            id = id,
            name = document.selectFirst("h2.cat-heading")
                ?.text() ?: "",

            shows = document.select("div.flw-item").map {
                val showId = pathOf(it.selectFirst("a")?.attr("href"))
                val showTitle = it.selectFirst("h3.film-name")
                    ?.text() ?: ""
                val showOverview = it.selectFirst("div.description")
                    ?.text()
                val showRuntime = it.selectFirst("div.fd-infor span.fdi-duration")
                    ?.text()?.substringBefore("m")?.toIntOrNull()
                val showPoster = it.selectFirst("img")
                    ?.attr("data-src")

                val isMovie = it.selectFirst("div.fd-infor > span.fdi-item")
                    ?.text() == "Movie"

                if (isMovie) {
                    Movie(
                        id = showId,
                        title = showTitle,
                        overview = showOverview,
                        runtime = showRuntime,
                        poster = showPoster,
                    )
                } else {
                    TvShow(
                        id = showId,
                        title = showTitle,
                        overview = showOverview,
                        runtime = showRuntime,
                        poster = showPoster,
                    )
                }
            }
        )

        return genre
    }


    override suspend fun getPeople(id: String, page: Int): People {
        throw Exception("People pages are not supported by HiAnime")
    }


    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val (episodeId, nonce) = when (videoType) {
            is Video.Type.Movie -> {
                val (animeId, movieNonce) = fetchAnimeContext(id)
                val listResponse = service.getEpisodeList(animeId = animeId, nonce = movieNonce)
                val firstEpisodeId = Jsoup.parse(listResponse.html).selectFirst("a.ssl-item.ep-item")
                    ?.attr("data-id") ?: throw Exception("HiAnime episode not found")
                firstEpisodeId to movieNonce
            }
            is Video.Type.Episode -> {
                val episodeDataId = id.substringBefore("::")
                val seasonId = id.substringAfter("::")
                val (_, episodeNonce) = resolveContext(seasonId)
                episodeDataId to episodeNonce
            }
        }

        val response = service.getEpisodeServers(episodeId = episodeId, nonce = nonce)

        val servers = Jsoup.parse(response.html).select("div.server-item[data-hash]")
            .map {
                Video.Server(
                    id = it.attr("data-hash"),
                    name = "${it.attr("data-server-name")} - ${it.attr("data-type").uppercase()}",
                )
            }

        return servers
    }

    override suspend fun getVideo(server: Video.Server): Video {
        // the hash is just base64 of the real embed url, no separate lookup needed
        val embedUrl = String(Base64.getDecoder().decode(server.id))
        val embedPage = service.getByUrl(embedUrl)
        val iframeSrc = embedPage.selectFirst("iframe")?.attr("src")
            ?: throw Exception("HiAnime embed not found")

        return Extractor.extract(iframeSrc)
    }


    private interface HiAnimeService {

        companion object {
            fun build(): HiAnimeService {
                val client = OkHttpClient.Builder()
                    .dns(DnsResolver.doh)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .connectTimeout(30, TimeUnit.SECONDS)
                    .build()

                val retrofit = Retrofit.Builder()
                    .baseUrl(URL)
                    .addConverterFactory(JsoupConverterFactory.create())
                    .addConverterFactory(GsonConverterFactory.create())
                    .client(client)
                    .build()

                return retrofit.create(HiAnimeService::class.java)
            }
        }

        @GET("home")
        suspend fun getHome(): Document

        @GET("type/{type}/")
        suspend fun getType(@Path("type") type: String, @Query("page") page: Int): Document

        @GET("genre/{id}/")
        suspend fun getGenreDoc(@Path("id") id: String, @Query("page") page: Int): Document

        // id carries a full path like "anime/one-piece", encoded so the slash survives
        @GET("{id}")
        suspend fun getPage(@Path("id", encoded = true) id: String): Document

        @GET
        suspend fun getByUrl(@Url url: String): Document

        @FormUrlEncoded
        @POST("wp-admin/admin-ajax.php")
        suspend fun getEpisodeList(
            @Field("action") action: String = "hianime_episode_list",
            @Field("anime_id") animeId: String,
            @Field("nonce") nonce: String,
        ): AjaxResponse

        @FormUrlEncoded
        @POST("wp-admin/admin-ajax.php")
        suspend fun getEpisodeServers(
            @Field("action") action: String = "hianime_episode_servers",
            @Field("episode_id") episodeId: String,
            @Field("nonce") nonce: String,
        ): AjaxResponse

        data class AjaxResponse(
            val status: Boolean = false,
            val html: String = "",
        )
    }
}
