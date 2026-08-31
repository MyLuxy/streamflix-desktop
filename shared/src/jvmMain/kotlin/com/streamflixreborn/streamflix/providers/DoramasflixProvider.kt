package com.streamflixreborn.streamflix.providers

import com.streamflixreborn.streamflix.models.ListItem

import com.google.gson.Gson
import com.tanasi.retrofit_jsoup.converter.JsoupConverterFactory
import com.streamflixreborn.streamflix.extractors.Extractor
import com.streamflixreborn.streamflix.models.*
import com.streamflixreborn.streamflix.models.doramasflix.ApiResponse
import com.streamflixreborn.streamflix.utils.DnsResolver
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import okhttp3.Cache
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.dnsoverhttps.DnsOverHttps
import org.jsoup.nodes.Document
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.POST
import retrofit2.http.Url
import java.io.File
import java.net.URL
import java.util.Locale
import java.util.concurrent.TimeUnit

object DoramasflixProvider : Provider {

    override val name = "Doramasflix"
    override val baseUrl = "https://doramasflix.in"
    private const val apiUrl = "https://sv1.fluxcedene.net/api/"
    override val language = "es"

    private val client = getOkHttpClient()

    private val service = Retrofit.Builder()
        .baseUrl(apiUrl)
        .addConverterFactory(GsonConverterFactory.create(Gson()))
        .client(client)
        .build()
        .create(DoramasflixService::class.java)

    private val serviceHtml = Retrofit.Builder()
        .baseUrl(baseUrl)
        .addConverterFactory(JsoupConverterFactory.create())
        .client(client)
        .build()
        .create(DoramasflixService::class.java)

    private fun getOkHttpClient(): OkHttpClient {
        val appCache = Cache(File("cacheDir", "okhttpcache"), 10 * 1024 * 1024)

        val clientBuilder = OkHttpClient.Builder()
            .cache(appCache)
            .readTimeout(30, TimeUnit.SECONDS)
            .connectTimeout(30, TimeUnit.SECONDS)

        return clientBuilder.dns(DnsResolver.doh).build()
    }

    private const val accessPlatform = "RxARncfg1S_MdpSrCvreoLu_SikCGMzE1NzQzODc3NjE2MQ=="

    private val languages = arrayOf(
        Pair("36", "[ENG]"),
        Pair("37", "[CAST]"),
        Pair("38", "[LAT]"),
        Pair("192", "[SUB]"),
        Pair("1327", "[POR]"),
        Pair("13109", "[COR]"),
        Pair("13110", "[JAP]"),
        Pair("13111", "[MAN]"),
        Pair("13112", "[TAI]"),
        Pair("13113", "[FIL]"),
        Pair("13114", "[IND]"),
        Pair("343422", "[VIET]"),
    )

    private fun String.getLang(): String {
        return languages.firstOrNull { it.first == this }?.second ?: ""
    }

    private interface DoramasflixService {
        @POST("gql")
        @Headers(
            "accept: application/json, text/plain, */*",
            "platform: doramasflix",
            "authorization: Bear",
            "x-access-jwt-token: ",
            "x-access-platform: $accessPlatform"
        )
        suspend fun getApiResponse(@Body body: okhttp3.RequestBody): ApiResponse

        @GET
        suspend fun getPage(@Url url: String): Document
    }

    private fun getPosterUrl(path: String?): String {
        return if (path?.startsWith("http") == true) {
            path
        } else {
            "https://image.tmdb.org/t/p/w500$path"
        }
    }

    override suspend fun getHome(): List<Category> {
        return try {
            coroutineScope {
                val homeDeferred = async { serviceHtml.getPage(baseUrl) }
                val popularDoramasDeferred = async { getTvShows(1) }
                val popularMoviesDeferred = async { getMovies(1) }

                val homeDocument = homeDeferred.await()
                val bannerShows = homeDocument.select("article.styles__Article-nxyw6x-3").mapNotNull { element ->
                    val href = element.selectFirst("div.styles__Buttons-sc-78uayx-17 a")?.attr("href") ?: return@mapNotNull null
                    val bannerUrl = element.selectFirst("noscript img")?.attr("src")
                    val title = element.selectFirst("h2.styles__Title-sc-78uayx-1")?.text() ?: return@mapNotNull null

                    val id = href.removePrefix("/")

                    if (href.contains("/peliculas-online/")) {
                        Movie(
                            id = id,
                            title = title,
                            banner = getPosterUrl(bannerUrl)
                        )
                    } else {
                        TvShow(
                            id = id,
                            title = title,
                            banner = getPosterUrl(bannerUrl)
                        )
                    }
                }

                val categories = mutableListOf(
                    Category(name = Category.FEATURED, list = bannerShows),
                    Category(name = "Doramas Populares", list = popularDoramasDeferred.await()),
                    Category(name = "Películas Populares", list = popularMoviesDeferred.await())
                )
                categories
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun search(query: String, page: Int): List<ListItem> {
        if (query.isBlank()) {
            return listOf(
                Genre("doramas", "Doramas"),
                Genre("peliculas", "Películas"),
                Genre("variedades", "Variedades")
            )
        }

        val searchQuery = """
            {"operationName":"searchAll","variables":{"input":"$query"},"query":"query searchAll(${'$'}input: String!) {\n  searchDorama(input: ${'$'}input, limit: 32) {\n    _id\n    slug\n    name\n    name_es\n    poster_path\n    poster\n    __typename\n  }\n  searchMovie(input: ${'$'}input, limit: 32) {\n    _id\n    name\n    name_es\n    slug\n    poster_path\n    poster\n    __typename\n  }\n}\n"}
        """.trimIndent()
        val body = searchQuery.toRequestBody("application/json".toMediaType())

        return try {
            val response = service.getApiResponse(body)
            val results = mutableListOf<ListItem>()

            response.data?.searchDorama?.forEach { show ->
                results.add(
                    TvShow(
                        id = "doramas-online/${show.slug}",
                        title = "${show.name} (${show.nameEs ?: ""})".trim(),
                        poster = getPosterUrl(show.posterPath ?: show.poster)
                    )
                )
            }

            response.data?.searchMovie?.forEach { show ->
                results.add(
                    Movie(
                        id = "peliculas-online/${show.slug}",
                        title = "${show.name} (${show.nameEs ?: ""})".trim(),
                        poster = getPosterUrl(show.posterPath ?: show.poster)
                    )
                )
            }

            results
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getMovies(page: Int): List<Movie> {
        val query = """
            {"operationName":"listMovies","variables":{"perPage":20,"sort":"POPULARITY_DESC","filter":{},"page":$page},"query":"query listMovies(${'$'}page: Int, ${'$'}perPage: Int, ${'$'}sort: SortFindManyMovieInput, ${'$'}filter: FilterFindManyMovieInput) {\n  paginationMovie(page: ${'$'}page, perPage: ${'$'}perPage, sort: ${'$'}sort, filter: ${'$'}filter) {\n    items {\n      _id\n      name\n      name_es\n      slug\n      poster_path\n      poster\n      __typename\n    }\n  }\n}\n"}
        """.trimIndent()
        val body = query.toRequestBody("application/json".toMediaType())

        return try {
            val response = service.getApiResponse(body)
            response.data?.paginationMovie?.items?.map {
                Movie(
                    id = "peliculas-online/${it.slug}",
                    title = "${it.name} (${it.nameEs ?: ""})".trim(),
                    poster = getPosterUrl(it.posterPath ?: it.poster)
                )
            } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getTvShows(page: Int): List<TvShow> {
        val query = """
            {"operationName":"listDoramas","variables":{"page":$page,"sort":"POPULARITY_DESC","perPage":20,"filter":{"isTVShow":false}},"query":"query listDoramas(${'$'}page: Int, ${'$'}perPage: Int, ${'$'}sort: SortFindManyDoramaInput, ${'$'}filter: FilterFindManyDoramaInput) {\n  paginationDorama(page: ${'$'}page, perPage: ${'$'}perPage, sort: ${'$'}sort, filter: ${'$'}filter) {\n    items {\n      _id\n      name\n      name_es\n      slug\n      poster_path\n      poster\n      __typename\n    }\n  }\n}\n"}
        """.trimIndent()
        val body = query.toRequestBody("application/json".toMediaType())

        return try {
            val response = service.getApiResponse(body)
            response.data?.paginationDorama?.items?.map {
                TvShow(
                    id = "doramas-online/${it.slug}",
                    title = "${it.name} (${it.nameEs ?: ""})".trim(),
                    poster = getPosterUrl(it.posterPath ?: it.poster)
                )
            } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    // the site dropped server-rendered __NEXT_DATA__ entirely (moved to app router rsc
    // streaming, which isnt reliably scrapable), these two go straight to the same graphql
    // api already used for search/listing instead of parsing page html
    override suspend fun getMovie(id: String): Movie {
        val slug = id.substringAfterLast("/")
        val query = """
            {"operationName":"detailMovie","variables":{"filter":{"slug":"$slug"}},"query":"query detailMovie(${'$'}filter: FilterFindOneMovieInput) {\n  detailMovie(filter: ${'$'}filter) {\n    _id\n    name\n    name_es\n    overview\n    poster_path\n    poster\n    runtime\n    release_date\n    __typename\n  }\n}\n"}
        """.trimIndent()
        val body = query.toRequestBody("application/json".toMediaType())

        return try {
            val response = service.getApiResponse(body)
            val movieData = response.data?.detailMovie ?: throw Exception("No se encontraron datos de la película.")

            Movie(
                id = movieData.id,
                title = "${movieData.name} (${movieData.nameEs ?: ""})".trim(),
                overview = movieData.overview,
                poster = getPosterUrl(movieData.posterPath ?: movieData.poster),
                runtime = movieData.runtime,
                released = movieData.releaseDate,
            )
        } catch (e: Exception) {
            throw Exception("No se pudieron cargar los detalles de la película: ${e.message}")
        }
    }

    override suspend fun getTvShow(id: String): TvShow {
        val slug = id.substringAfterLast("/")
        val query = """
            {"operationName":"detailDorama","variables":{"filter":{"slug":"$slug"}},"query":"query detailDorama(${'$'}filter: FilterFindOneDoramaInput) {\n  detailDorama(filter: ${'$'}filter) {\n    _id\n    name\n    name_es\n    overview\n    poster_path\n    poster\n    __typename\n  }\n}\n"}
        """.trimIndent()
        val body = query.toRequestBody("application/json".toMediaType())

        return try {
            val response = service.getApiResponse(body)
            val doramaData = response.data?.detailDorama ?: throw Exception("No se encontraron datos del dorama.")
            val doramaId = doramaData.id

            val seasonQuery = """
                {"operationName":"listSeasons","variables":{"serie_id":"$doramaId"},"query":"query listSeasons(${'$'}serie_id: MongoID!) {\n  listSeasons(sort: NUMBER_ASC, filter: {serie_id: ${'$'}serie_id}) {\n    slug\n    season_number\n    poster_path\n    __typename\n  }\n}\n"}
            """.trimIndent()
            val seasonBody = seasonQuery.toRequestBody("application/json".toMediaType())
            val seasonResponse = service.getApiResponse(seasonBody)

            val seasons = seasonResponse.data?.listSeasons?.map {
                Season(
                    id = "$doramaId/${it.seasonNumber}",
                    number = it.seasonNumber,
                    title = "Temporada ${it.seasonNumber}",
                    poster = getPosterUrl(it.posterPath)
                )
            } ?: emptyList()

            TvShow(
                id = doramaId,
                title = "${doramaData.name} (${doramaData.nameEs ?: ""})".trim(),
                overview = doramaData.overview,
                poster = getPosterUrl(doramaData.posterPath ?: doramaData.poster),
                seasons = seasons
            )
        } catch (e: Exception) {
            throw Exception("No se pudieron cargar los detalles del dorama: ${e.message}")
        }
    }

    override suspend fun getEpisodesBySeason(seasonId: String): List<Episode> {
        val doramaId = seasonId.substringBefore("/")
        val seasonNumber = seasonId.substringAfter("/").toInt()

        val episodeQuery = """
            {"operationName":"listEpisodes","variables":{"serie_id":"$doramaId","season_number":$seasonNumber},"query":"query listEpisodes(${'$'}season_number: Float!, ${'$'}serie_id: MongoID!) {\n  listEpisodes(sort: NUMBER_ASC, filter: {type_serie: \"dorama\", serie_id: ${'$'}serie_id, season_number: ${'$'}season_number}) {\n    _id\n    name\n    slug\n    episode_number\n    season_number\n    still_path\n    __typename\n  }\n}\n"}
        """.trimIndent()
        val body = episodeQuery.toRequestBody("application/json".toMediaType())

        return try {
            val response = service.getApiResponse(body)
            response.data?.listEpisodes?.map {
                // the mongo _id, not the slug: getServers needs it to call getEpisodeLinks
                Episode(
                    id = it.id,
                    number = it.episodeNumber ?: 0,
                    title = "Episodio ${it.episodeNumber ?: 0}: ${it.name ?: ""}".trim(),
                    poster = getPosterUrl(it.stillPath)
                )
            } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getServers(id: String, videoType: Video.Type): List<Video.Server> {
        val query = when (videoType) {
            is Video.Type.Movie -> """
                {"operationName":"getMovieLinks","variables":{"id":"$id"},"query":"query getMovieLinks(${'$'}id: MongoID) {\n  getMovieLinks(id: ${'$'}id) {\n    _id\n    links_online\n    __typename\n  }\n}\n"}
            """.trimIndent()
            is Video.Type.Episode -> """
                {"operationName":"getEpisodeLinks","variables":{"id":"$id"},"query":"query getEpisodeLinks(${'$'}id: MongoID!) {\n  getEpisodeLinks(id: ${'$'}id) {\n    _id\n    links_online\n    __typename\n  }\n}\n"}
            """.trimIndent()
        }
        val body = query.toRequestBody("application/json".toMediaType())

        return try {
            val response = service.getApiResponse(body)
            val links = when (videoType) {
                is Video.Type.Movie -> response.data?.getMovieLinks?.linksOnline
                is Video.Type.Episode -> response.data?.getEpisodeLinks?.linksOnline
            } ?: emptyList()

            links.mapNotNull { link ->
                // the api already resolves the fkplayer.xyz wrapper down to the real embed
                // host (fkplayer's own decode endpoint moved off the api route this used to call)
                val serverUrl = link.embed ?: link.link ?: return@mapNotNull null
                val lang = link.lang?.getLang() ?: ""
                val serverName = runCatching {
                    URL(serverUrl).host.split(".").first { it != "www" }.replaceFirstChar { it.titlecase(Locale.ROOT) }
                }.getOrDefault("Server")
                Video.Server(id = serverUrl, name = "$serverName $lang".trim())
            }.distinctBy { it.id }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override suspend fun getVideo(server: Video.Server): Video = Extractor.extract(server.id, server)
    override val logo: String = "https://doramasflix.in/img/logo.png"

    override suspend fun getGenre(id: String, page: Int): Genre {
        val list: List<Show> = when (id) {
            "peliculas" -> getMovies(page)
            "variedades" -> {
                val query = """
                    {"operationName":"listDoramas","variables":{"page":$page,"sort":"CREATEDAT_DESC","perPage":32,"filter":{"isTVShow":true}},"query":"query listDoramas(${'$'}page: Int, ${'$'}perPage: Int, ${'$'}sort: SortFindManyDoramaInput, ${'$'}filter: FilterFindManyDoramaInput) {\n  paginationDorama(page: ${'$'}page, perPage: ${'$'}perPage, sort: ${'$'}sort, filter: ${'$'}filter) {\n    items {\n      _id\n      name\n      name_es\n      slug\n      poster_path\n      poster\n      __typename\n    }\n  }\n}\n"}
                """.trimIndent()
                val body = query.toRequestBody("application/json".toMediaType())
                val response = service.getApiResponse(body)
                response.data?.paginationDorama?.items?.map {
                    TvShow(
                        id = it.slug,
                        title = "${it.name} (${it.nameEs ?: ""})".trim(),
                        poster = getPosterUrl(it.posterPath ?: it.poster)
                    )
                } ?: emptyList()
            }
            else -> getTvShows(page)
        }
        return Genre(id = id, name = id.replaceFirstChar { it.uppercase() }, shows = list)
    }

    override suspend fun getPeople(id: String, page: Int): People = throw Exception("Not yet implemented")
}
