package com.kang77556.premiumwatchface.wear

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class WffRegistrationContractTest {
    @Test
    fun manifestAndRawWatchfaceDeclareResourceOnlyWffContract() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        val gradle = File("build.gradle.kts").readText()
        val watchface = File("src/main/res/raw/watchface.xml")

        assertTrue(manifest.contains("android.hardware.type.watch"))
        assertTrue(manifest.contains("com.google.wear.watchface.format.version"))
        assertTrue("WFF APK must declare hasCode=false", manifest.contains("android:hasCode=\"false\""))
        assertFalse("WFF APK must not register executable services", manifest.contains("<service"))
        assertTrue("WFF v1 requires minSdk 33+", Regex("minSdk\\s*=\\s*(3[3-9]|[4-9][0-9])").containsMatchIn(gradle))
        assertTrue("WFF watchface must live in res/raw/watchface.xml", watchface.exists())

        val xml = watchface.readText()
        assertTrue(xml.contains("<WatchFace"))
        assertTrue(xml.contains("<AnalogClock"))
        assertTrue(xml.contains("<HourHand"))
        assertTrue(xml.contains("<MinuteHand"))
    }
}
