plugins {
  id("com.android.library") version "8.9.1"
  id("org.jetbrains.kotlin.android") version "2.2.20"
  id("maven-publish")
  id("signing")
}

group = "io.github.wolf3c.tracemind"
version = providers.environmentVariable("TRACEMIND_SDK_PUBLISH_VERSION").orElse("0.1.0").get()

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

  publishing {
    singleVariant("release") {
      withSourcesJar()
    }
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

val androidJavadocsJar by tasks.registering(Jar::class) {
  archiveClassifier.set("javadoc")
}

publishing {
  repositories {
    maven {
      name = "TraceMindStaging"
      url = layout.buildDirectory.dir("maven-staging").get().asFile.toURI()
    }
  }

  publications {
    register<MavenPublication>("release") {
      groupId = "io.github.wolf3c.tracemind"
      artifactId = "tracemind-android"
      version = project.version.toString()

      afterEvaluate {
        from(components["release"])
      }
      artifact(androidJavadocsJar)

      pom {
        name.set("TraceMind Android SDK")
        description.set("TraceMind Android capture SDK.")
        url.set("https://github.com/wolf3c/TraceMind")
        licenses {
          license {
            name.set("UNLICENSED")
            url.set("https://github.com/wolf3c/TraceMind")
          }
        }
        developers {
          developer {
            id.set("wolf3c")
            name.set("TraceMind")
          }
        }
        scm {
          connection.set("scm:git:https://github.com/wolf3c/TraceMind.git")
          developerConnection.set("scm:git:https://github.com/wolf3c/TraceMind.git")
          url.set("https://github.com/wolf3c/TraceMind")
        }
      }
    }
  }
}

signing {
  val signingKey = providers.environmentVariable("GPG_SIGNING_KEY").orNull
  val signingPassword = providers.environmentVariable("GPG_SIGNING_PASSWORD").orNull
  if (!signingKey.isNullOrBlank()) {
    useInMemoryPgpKeys(signingKey, signingPassword)
    sign(publishing.publications)
  }
}
