package com.kang77556.premiumwatchface.wear

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class WffRegistrationContractTest {
    @Test
    fun manifestMetadataAndResourcesDeclareValidWffContract() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        val gradle = File("build.gradle.kts").readText()
        val watchface = File("src/main/res/raw/watchface.xml")
        val info = File("src/main/res/xml/watch_face_info.xml")
        val preview = File("src/main/res/drawable/preview.xml")
        val hour = File("src/main/res/drawable/hour_hand.xml")
        val minute = File("src/main/res/drawable/minute_hand.xml")

        assertTrue(manifest.contains("android.hardware.type.watch"))
        assertTrue(manifest.contains("com.google.wear.watchface.format.version"))
        assertTrue("WFF APK must declare hasCode=false", manifest.contains("android:hasCode=\"false\""))
        assertFalse("WFF APK must not register executable services", manifest.contains("<service"))
        assertTrue("WFF v1 requires minSdk 33+", Regex("minSdk\\s*=\\s*(3[3-9]|[4-9][0-9])").containsMatchIn(gradle))

        assertTrue("WFF watchface must live in res/raw/watchface.xml", watchface.exists())
        assertTrue("WFF metadata must exist", info.exists())
        val infoXml = info.readText()
        assertTrue("watch_face_info.xml must use WatchFaceInfo root", infoXml.contains("<WatchFaceInfo"))
        assertTrue("watch_face_info.xml must declare preview", infoXml.contains("<Preview value=\"@drawable/preview\""))
        assertTrue("preview drawable must exist", preview.exists())

        val xml = watchface.readText()
        assertTrue(xml.contains("<WatchFace"))
        assertTrue(xml.contains("<AnalogClock"))
        assertTrue(xml.contains("<HourHand"))
        assertTrue(xml.contains("<MinuteHand"))
        assertTrue("hour hand drawable must exist", hour.exists())
        assertTrue("minute hand drawable must exist", minute.exists())
    }
}
