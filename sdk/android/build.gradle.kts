plugins {
  id("com.android.library")
  kotlin("android")
}

android {
  namespace = "com.tracemind"
  compileSdk = 35

  defaultConfig {
    minSdk = 23
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }
}

dependencies {
  testImplementation("junit:junit:4.13.2")
}
