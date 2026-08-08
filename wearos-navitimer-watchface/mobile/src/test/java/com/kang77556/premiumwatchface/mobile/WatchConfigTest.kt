package com.kang77556.premiumwatchface.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchConfigTest {
    @Test fun defaultsMatchApprovedDesign() {
        val config = WatchConfig()
        assertEquals(1, config.version)
        assertEquals("rose_gold_black", config.style)
        assertTrue(config.aod)
        assertEquals("/watchface/config", WatchConfig.PATH)
    }
}
