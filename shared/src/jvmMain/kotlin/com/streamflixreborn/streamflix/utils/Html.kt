package com.streamflixreborn.streamflix.utils

import org.jsoup.parser.Parser

// desktop stand-in for android.text.Html.fromHtml - just the entity-unescaping part callers use
object Html {
    fun fromHtml(source: String): String = Parser.unescapeEntities(source, false)
}
