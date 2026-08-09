plugins {
    id("com.android.application")
}

android {
    namespace = "com.kang77556.premiumwatchface.wear"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.kang77556.premiumwatchface.wear"
        minSdk = 33
        targetSdk = 35
        versionCode = 2
        versionName = "2.0"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
