plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "org.chatrouter.bridge"
    compileSdk = 36
    defaultConfig { applicationId = "org.chatrouter.bridge"; minSdk = 26; targetSdk = 35; versionCode = (System.getenv("CHAT_ROUTER_VERSION_CODE")?.toIntOrNull() ?: System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1); versionName = "1.0." + (System.getenv("CHAT_ROUTER_VERSION_CODE") ?: System.getenv("GITHUB_RUN_NUMBER") ?: "1") }
    signingConfigs {
        create("persistent") {
            storeFile = System.getenv("CHAT_ROUTER_KEYSTORE_PATH")?.let { file(it) }
            storePassword = System.getenv("CHAT_ROUTER_STORE_PASSWORD") ?: ""
            keyAlias = System.getenv("CHAT_ROUTER_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("CHAT_ROUTER_KEY_PASSWORD") ?: ""
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (!System.getenv("CHAT_ROUTER_KEYSTORE_PATH").isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("persistent")
            }
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
