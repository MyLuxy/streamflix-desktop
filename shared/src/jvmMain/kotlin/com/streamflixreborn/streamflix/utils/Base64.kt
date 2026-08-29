package com.streamflixreborn.streamflix.utils

object Base64 {
    const val DEFAULT = 0
    const val NO_PADDING = 1
    const val NO_WRAP = 2
    const val CRLF = 4
    const val URL_SAFE = 8
    const val NO_CLOSE = 16

    private fun coderFor(flags: Int): kotlin.io.encoding.Base64 {
        val base = if (flags and URL_SAFE != 0) kotlin.io.encoding.Base64.UrlSafe else kotlin.io.encoding.Base64.Default
        return if (flags and NO_PADDING != 0) {
            base.withPadding(kotlin.io.encoding.Base64.PaddingOption.ABSENT)
        } else {
            base
        }
    }

    fun encodeToString(input: ByteArray, flags: Int): String =
        coderFor(flags).encode(input)

    fun encode(input: ByteArray, flags: Int): ByteArray =
        coderFor(flags).encode(input).toByteArray(Charsets.UTF_8)

    fun decode(input: String, flags: Int): ByteArray {
        val base = if (flags and URL_SAFE != 0) kotlin.io.encoding.Base64.UrlSafe else kotlin.io.encoding.Base64.Default
        // Be lenient about padding on decode, matching android.util.Base64's tolerant behavior.
        val decoder = base.withPadding(kotlin.io.encoding.Base64.PaddingOption.PRESENT_OPTIONAL)
        return decoder.decode(input)
    }

    fun decode(input: ByteArray, flags: Int): ByteArray = decode(input.toString(Charsets.UTF_8), flags)
}
