package com.streamflixreborn.streamflix.utils

import com.microsoft.playwright.Browser
import com.microsoft.playwright.BrowserContext
import com.microsoft.playwright.BrowserType
import com.microsoft.playwright.Page
import com.microsoft.playwright.Playwright
import com.microsoft.playwright.options.WaitUntilState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

// Desktop stand-in for the Android WebViewResolver: same public contract (get/getResult) so the
// providers/extractors that depend on it port over with just an import change. Drives a real
// Chromium via Playwright instead of an embedded Android WebView. Requires `playwright install`
// (or the PLAYWRIGHT_BROWSERS_PATH env var pointing at a pre-fetched Chromium) to have run once
// on the machine, see the porting notes for the WebView-dependent providers.
// No analogue for Android's "pop up a dialog and let the user solve the CAPTCHA with the TV remote"
// escalation path exists here - showImmediately instead launches a headed (visible) browser window
// up front, so a human can solve a challenge manually if automatic polling never clears it.
class HeadlessBrowserResolver {

    data class Result(
        val html: String,
        val evaluatedValue: String? = null,
        val finalUrl: String? = null,
    )

    private val mutex = Mutex()

    private val challengeKeywords = listOf(
        "Just a moment...", "cf-browser-verification", "challenge-running", "Checking your browser", "cloudflare"
    )

    suspend fun get(
        url: String,
        headers: Map<String, String> = emptyMap(),
        completion: ((currentUrl: String, html: String, cookies: String) -> Boolean)? = null,
        shouldAllowNavigation: ((url: String, isMainFrame: Boolean) -> Boolean)? = null,
        pageReadyScriptProvider: ((currentUrl: String, html: String, cookies: String) -> String?)? = null,
        showImmediately: Boolean = false,
    ): String = getResult(url, headers, completion, shouldAllowNavigation, null, pageReadyScriptProvider, showImmediately).html

    suspend fun getResult(
        url: String,
        headers: Map<String, String> = emptyMap(),
        completion: ((currentUrl: String, html: String, cookies: String) -> Boolean)? = null,
        shouldAllowNavigation: ((url: String, isMainFrame: Boolean) -> Boolean)? = null,
        valueScript: String? = null,
        pageReadyScriptProvider: ((currentUrl: String, html: String, cookies: String) -> String?)? = null,
        showImmediately: Boolean = false,
    ): Result = mutex.withLock {
        withContext(Dispatchers.IO) {
            withTimeoutOrNull(120_000L) {
                runResolution(url, headers, completion, shouldAllowNavigation, valueScript, pageReadyScriptProvider, showImmediately)
            } ?: Result(html = "<html><body>Timeout</body></html>", finalUrl = url)
        }
    }

    private fun runResolution(
        url: String,
        headers: Map<String, String>,
        completion: ((String, String, String) -> Boolean)?,
        shouldAllowNavigation: ((String, Boolean) -> Boolean)?,
        valueScript: String?,
        pageReadyScriptProvider: ((String, String, String) -> String?)?,
        showImmediately: Boolean,
    ): Result {
        Playwright.create().use { playwright ->
            val browser: Browser = playwright.chromium().launch(
                BrowserType.LaunchOptions().setHeadless(!showImmediately)
            )
            try {
                val context: BrowserContext = browser.newContext(
                    Browser.NewContextOptions()
                        .setUserAgent(NetworkClient.USER_AGENT)
                        .setExtraHTTPHeaders(headers)
                )
                if (shouldAllowNavigation != null) {
                    context.route("**/*") { route ->
                        val request = route.request()
                        val isMainFrame = request.frame() == request.frame().page().mainFrame()
                        val allowed = shouldAllowNavigation(request.url(), isMainFrame)
                        if (allowed) route.resume() else route.abort()
                    }
                }

                val page: Page = context.newPage()
                page.navigate(url, Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED))

                var pollingCount = 0
                while (pollingCount < 80) {
                    val currentUrl = page.url()
                    val html = page.content()
                    val cookies = context.cookies(currentUrl).joinToString("; ") { "${it.name}=${it.value}" }
                    val hasClearance = cookies.contains("cf_clearance")
                    val isChallenge = challengeKeywords.any { html.contains(it, ignoreCase = true) }
                    val hasContent = html.contains("article") || html.contains("iframe") ||
                            html.contains("TPost") || html.contains("grid-item") || html.contains("optnslst")
                    val success = completion?.invoke(currentUrl, html, cookies)
                        ?: ((!isChallenge && hasContent && html.length > 1000) || hasClearance)

                    val pageReadyScript = pageReadyScriptProvider?.invoke(currentUrl, html, cookies)
                    if (!pageReadyScript.isNullOrBlank()) {
                        runCatching { page.evaluate(pageReadyScript) }
                    }

                    if (success) {
                        return finalize(page, html, currentUrl, valueScript)
                    }

                    pollingCount++
                    Thread.sleep(2000)
                }

                return finalize(page, page.content(), page.url(), valueScript)
            } finally {
                browser.close()
            }
        }
    }

    private fun finalize(page: Page, html: String, finalUrl: String, valueScript: String?): Result {
        val evaluated = valueScript?.let { runCatching { page.evaluate(it)?.toString() }.getOrNull() }
        return Result(html = "<html>$html</html>", evaluatedValue = evaluated?.trim(), finalUrl = finalUrl)
    }

    // Covers the "navigate and tell me where it actually ended up" pattern a couple of extractors
    // use their own raw WebView for (StreamWish/Upzone's resolveRedirectWithWebView): load the
    // page, let Playwright follow any redirects (client-side JS included) to completion, then
    // poll page.url() until it matches one of the given substrings or the timeout runs out.
    suspend fun resolveNavigation(
        url: String,
        headers: Map<String, String> = emptyMap(),
        matchSubstrings: List<String>,
        timeoutMs: Long = 30_000L,
    ): String = mutex.withLock {
        withContext(Dispatchers.IO) {
            withTimeoutOrNull(timeoutMs) {
                Playwright.create().use { playwright ->
                    val browser = playwright.chromium().launch(BrowserType.LaunchOptions().setHeadless(true))
                    try {
                        val context = browser.newContext(
                            Browser.NewContextOptions().setUserAgent(NetworkClient.USER_AGENT).setExtraHTTPHeaders(headers)
                        )
                        val page = context.newPage()
                        runCatching { page.navigate(url, Page.NavigateOptions().setWaitUntil(WaitUntilState.LOAD)) }
                        if (matchSubstrings.isEmpty()) return@use page.url()
                        var attempts = 0
                        while (attempts < 15) {
                            val current = page.url()
                            if (matchSubstrings.any { current.contains(it) }) return@use current
                            attempts++
                            Thread.sleep(1000)
                        }
                        page.url()
                    } finally {
                        browser.close()
                    }
                }
            } ?: url
        }
    }

    // Covers "load the page and tell me the URL of the first outgoing request matching this",
    // e.g. VidsrcRuExtractor watching for the .m3u8 request the page itself fires off.
    suspend fun waitForRequestUrl(
        url: String,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Long = 30_000L,
        predicate: (String) -> Boolean,
    ): String? = mutex.withLock {
        withContext(Dispatchers.IO) {
            withTimeoutOrNull(timeoutMs) {
                Playwright.create().use { playwright ->
                    val browser = playwright.chromium().launch(BrowserType.LaunchOptions().setHeadless(true))
                    try {
                        val context = browser.newContext(
                            Browser.NewContextOptions().setUserAgent(NetworkClient.USER_AGENT).setExtraHTTPHeaders(headers)
                        )
                        val page = context.newPage()
                        val request = page.waitForRequest({ req -> predicate(req.url()) }) {
                            runCatching { page.navigate(url) }
                        }
                        request.url()
                    } finally {
                        browser.close()
                    }
                }
            }
        }
    }

    // Covers "load the page, run its own JS, and give me the body of the first response matching
    // this" - e.g. VidLinkExtractor reading a fetch() response the page makes to its own API.
    suspend fun waitForResponseBody(
        url: String,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Long = 30_000L,
        predicate: (String) -> Boolean,
    ): String? = mutex.withLock {
        withContext(Dispatchers.IO) {
            withTimeoutOrNull(timeoutMs) {
                Playwright.create().use { playwright ->
                    val browser = playwright.chromium().launch(BrowserType.LaunchOptions().setHeadless(true))
                    try {
                        val context = browser.newContext(
                            Browser.NewContextOptions().setUserAgent(NetworkClient.USER_AGENT).setExtraHTTPHeaders(headers)
                        )
                        val page = context.newPage()
                        val response = page.waitForResponse({ resp -> predicate(resp.url()) }) {
                            runCatching { page.navigate(url) }
                        }
                        response.text()
                    } finally {
                        browser.close()
                    }
                }
            }
        }
    }
}
