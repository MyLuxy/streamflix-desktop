package com.streamflixreborn.streamflix.extractors

import com.streamflixreborn.streamflix.utils.Log
import com.streamflixreborn.streamflix.models.Video

abstract class Extractor {

    abstract val name: String
    abstract val mainUrl: String
    open val aliasUrls: List<String> = emptyList()
    open val rotatingDomain: List<Regex> = emptyList()

    abstract suspend fun extract(link: String): Video

    open suspend fun extract(link: String, server: Video.Server? = null): Video {
        return extract(link)
    }

    companion object {
        private val extractors = listOf(
            JKPlayerExtractor(),
            RabbitstreamExtractor(),
            RabbitstreamExtractor.MegacloudExtractor(),
            RabbitstreamExtractor.DokicloudExtractor(),
            RabbitstreamExtractor.PremiumEmbedingExtractor(),
            StreamhubExtractor(),
            VtubeExtractor(),
            NuuploadExtractor(),
            VoeExtractor(),
            StreamtapeExtractor(),
            VidozaExtractor(),
            VidsrcToExtractor(),
            VidplayExtractor(),
            VidplayExtractor.MyCloud(),
            VidplayExtractor.VidplayOnline(),
            NekostreamExtractor(),
            FilemoonExtractor(),
            MyFileStorageExtractor(),
            MoflixExtractor(),
            MStreamDayExtractor(),
            VidsrcNetExtractor(),
            TwoEmbedExtractor(),
            ChillxExtractor(),
            ChillxExtractor.JeanExtractor(),
            ChillxExtractor.MoviesapiExtractor(),
            MoviesapiExtractor(),
            CloseloadExtractor(),
            LuluVdoExtractor(),
            DoodLaExtractor(),
            DoodLaExtractor.DoodLiExtractor(),
            DoodLaExtractor.DoodExtractor(),
            VidPlyExtractor(),
            MagaSavorExtractor(),
            VidMoLyExtractor(),
            VidMoLyExtractor.ToDomain(),
            VideoSibNetExtractor(),
            SaveFilesExtractor(),
            BigWarpExtractor(),
            LoadXExtractor(),
            VidHideExtractor(),
            VeevExtractor(),
            RidooExtractor(),
            USTRExtractor(),
            VidGuardExtractor(),
            OkruExtractor(),
            StreamSBExtractor(),
            Mp4UploadExtractor(),
            StreamlareExtractor(),
            NinjaStreamExtractor(),
            UchExtractor(),
            VixSrcExtractor(),
            VixcloudExtractor(),
            GoodstreamExtractor(),
            LamovieExtractor(),
            UqloadExtractor(),
            MailRuExtractor(),
            MixDropExtractor(),
            SupervideoExtractor(),
            DroploadExtractor(),
            RpmvidExtractor(),
            YourUploadExtractor(),
            PlusPomlaExtractor(),
            OneuploadExtractor(),
            FsvidExtractor(),
            GoogleDriveExtractor(),
            PcloudExtractor(),
            AmazonDriveExtractor(),
            VidzyExtractor(),
            GuploadExtractor(),
            StreamUpExtractor(),
            EinschaltenExtractor(),
            VidflixExtractor(),
            VidrockExtractor(),
            VideasyExtractor(),
            VidzeeExtractor(),
            VidnestExtractor(),
            PrimeSrcExtractor(),
            VidoraExtractor(),
            GxPlayerExtractor(),
            UpZurExtractor(),
            DailymotionExtractor(),
            ApiVoirFilmExtractor(),
            StreamixExtractor(),
            ShareCloudyExtractor(),
            StreamrubyExtractor(),
            VidaraExtractor(),
            VidsonicExtractor(),
            HxfileExtractor(),
            ZillaExtractor(),
            PDrainExtractor(),
            MaxstreamExtractor(),
            VidxGoExtractor(),
            AfterDarkExtractor(),
            FrembedExtractor(),
            OnRegardeOuExtractor(),
        )

        suspend fun extract(link: String, server: Video.Server? = null): Video {
            var finalLink = link

            // Universal bridge resolution (StreamHG/Sync/Cuevana): the bridge link (e.g. mysync.mov)
            // doesn't belong to any specific extractor, but the link it redirects to does.
            if (link.contains("mysync.mov/stream/")) {
                try {
                    val client = okhttp3.OkHttpClient.Builder()
                        .followRedirects(true)
                        .followSslRedirects(true)
                        .build()

                    val responseBody = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                        val request = okhttp3.Request.Builder()
                            .url(link)
                            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                            .build()
                        client.newCall(request).execute().use { it.body?.string() }
                    } ?: ""

                    val redirectUrl = responseBody.substringAfter("window.location.replace(\"", "").substringBefore("\"")
                        .ifEmpty { responseBody.substringAfter("window.location.href = \"", "").substringBefore("\"") }
                        .ifEmpty { responseBody.substringAfter("src=\"", "").substringBefore("\"") }

                    if (redirectUrl.isNotEmpty() && redirectUrl.startsWith("http")) {
                        Log.d("Extractor", "Universal Bridge resolved: $link -> $redirectUrl")
                        finalLink = redirectUrl
                    }
                } catch (e: Exception) {
                    Log.e("Extractor", "Universal Bridge error: ${e.message}")
                }
            }

            val urlRegex = Regex("^(https?://)?(www\\.)?")
            val compareUrl = finalLink.lowercase().replace(urlRegex, "")

            var foundExtractor: Extractor? = null

            for (extractor in extractors) {
                if (compareUrl.startsWith(extractor.mainUrl.replace(urlRegex, ""))) {
                    foundExtractor = extractor
                    break
                } else {
                    for (aliasUrl in extractor.aliasUrls) {
                        if (compareUrl.startsWith(aliasUrl.lowercase().replace(urlRegex, ""))) {
                            foundExtractor = extractor
                            break
                        }
                    }
                }
                if (foundExtractor != null) break
            }

            if (foundExtractor == null) {
                for (extractor in extractors) {
                    if (compareUrl.startsWith(
                            extractor.mainUrl.replace(
                                Regex("^(https?://)?(www\\.)?(.*?)(\\.[a-z]+)"),
                                "$3"
                            )
                        )
                    ) {
                        foundExtractor = extractor
                        break
                    } else {
                        for (aliasUrl in extractor.aliasUrls) {
                            if (compareUrl.startsWith(
                                    aliasUrl.replace(
                                        Regex("^(https?://)?(www\\.)?(.*?)(\\.[a-z]+)"),
                                        "$3"
                                    )
                                )
                            ) {
                                foundExtractor = extractor
                                break
                            }
                        }
                    }
                    if (foundExtractor != null) break
                }
            }

            if (foundExtractor == null) {
                for (extractor in extractors) {
                    if (extractor.rotatingDomain.any { it.containsMatchIn(compareUrl) }) {
                        foundExtractor = extractor
                        break
                    }
                }
            }

            if (foundExtractor == null) {
                for (extractor in extractors) {
                    if ((server?.name?.lowercase() ?: "").contains(extractor.name.lowercase())) {
                        foundExtractor = extractor
                        break
                    }
                }
            }

            if (foundExtractor != null) {
                Log.i("StreamFlixES", "[EXTRACTOR] -> Starting: ${foundExtractor.name} (URL: $finalLink)")
                val video = foundExtractor.extract(finalLink)
                Log.i("StreamFlixES", "[VIDEO] -> Extracted: ${video.source}")
                return video
            }

            throw Exception("No extractors found for URL: $finalLink")
        }
    }
}
