plugins { id("com.android.application") }

android {
    namespace = "com.kang77556.premiumwatchface.wear"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.kang77556.premiumwatchface.wear"
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
}

dependencies {
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
}
