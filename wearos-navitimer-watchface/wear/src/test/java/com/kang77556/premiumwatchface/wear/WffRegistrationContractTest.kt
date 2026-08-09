package com.kang77556.premiumwatchface.wear

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class WffRegistrationContractTest {
    @Test
    fun manifestAndRawWatchfaceDeclareWffContract() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        val watchface = File("src/main/res/raw/watchface.xml")
        assertTrue(manifest.contains("com.google.wear.watchface.format.version"))
        assertTrue(manifest.contains("android.hardware.type.watch"))
        assertTrue("WFF watchface must live in res/raw/watchface.xml", watchface.exists())
        val xml = watchface.readText()
        assertTrue(xml.contains("<WatchFace"))
        assertTrue(xml.contains("<AnalogClock"))
        assertTrue(xml.contains("<HourHand"))
        assertTrue(xml.contains("<MinuteHand"))
    }
}
