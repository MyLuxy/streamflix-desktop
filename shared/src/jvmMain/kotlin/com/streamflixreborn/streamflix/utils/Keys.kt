package com.streamflixreborn.streamflix.utils

// The Android app resolves these via a native (JNI) library (streamflix-keys, built from C++ via
// CMake) so the values don't show up in static analysis of the APK. That native lib isn't built
// for desktop in this pass - callers (currently just one fallback path in CB01Provider) should
// treat a failure here the same as any other extractor/provider failure and fall back.
object Keys {
    fun getUprotMsfiApiBase(): String =
        throw UnsupportedOperationException("Keys.getUprotMsfiApiBase is Android-native-only, not ported to desktop yet")

    fun getUprotMseApiBase(): String =
        throw UnsupportedOperationException("Keys.getUprotMseApiBase is Android-native-only, not ported to desktop yet")

    fun getUprotApiKey(): String =
        throw UnsupportedOperationException("Keys.getUprotApiKey is Android-native-only, not ported to desktop yet")
}
