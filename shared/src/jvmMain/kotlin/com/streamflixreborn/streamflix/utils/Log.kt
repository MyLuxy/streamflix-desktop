package com.streamflixreborn.streamflix.utils

object Log {
    var enabled = true

    fun d(tag: String, msg: String) {
        if (enabled) println("D/$tag: $msg")
    }

    fun i(tag: String, msg: String) {
        if (enabled) println("I/$tag: $msg")
    }

    fun w(tag: String, msg: String) {
        if (enabled) println("W/$tag: $msg")
    }

    fun w(tag: String, msg: String, throwable: Throwable?) {
        if (enabled) {
            println("W/$tag: $msg")
            throwable?.printStackTrace()
        }
    }

    fun e(tag: String, msg: String) {
        if (enabled) System.err.println("E/$tag: $msg")
    }

    fun e(tag: String, msg: String, throwable: Throwable?) {
        if (enabled) {
            System.err.println("E/$tag: $msg")
            throwable?.printStackTrace()
        }
    }
}
