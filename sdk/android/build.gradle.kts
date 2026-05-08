plugins {
  id("com.android.library") version "8.9.1"
  id("org.jetbrains.kotlin.android") version "2.2.20"
}

android {
  namespace = "com.tracemind"
  compileSdk = 36

  defaultConfig {
    minSdk = 23
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

kotlin {
  compilerOptions {
    jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
  }
}

dependencies {
  testImplementation("junit:junit:4.13.2")
}
