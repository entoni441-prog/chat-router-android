plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "org.chatrouter.bridge"
    compileSdk = 36
    defaultConfig { applicationId = "org.chatrouter.bridge"; minSdk = 26; targetSdk = 35; versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1); versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "1") }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
