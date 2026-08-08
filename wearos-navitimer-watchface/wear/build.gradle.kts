plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

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
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    testImplementation("junit:junit:4.13.2")
}
