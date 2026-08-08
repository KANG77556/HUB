package com.kang77556.premiumwatchface.wear

data class WatchConfig(
    val version: Int = 1,
    val style: String = "rose_gold_black",
    val aod: Boolean = true
) {
    companion object {
        const val PATH = "/watchface/config"
        const val KEY_VERSION = "version"
        const val KEY_STYLE = "style"
        const val KEY_AOD = "aod"
    }
}
