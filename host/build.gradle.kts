import java.util.zip.ZipFile

plugins {
    java
}

group = "dev.effectmc"
version = "0.1.0"

val paperVersion = "26.3.build.230-stable"
val graalVersion = "25.3.4.1"
val gsonVersion = "2.13.2"

repositories {
    mavenCentral()
    maven(url = "https://repo.papermc.io/repository/maven-public/")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

dependencies {
    // Paper and Graal are provided by the server at runtime. Nothing is shaded.
    compileOnly("io.papermc.paper:paper-api:$paperVersion")
    compileOnly("com.google.code.gson:gson:$gsonVersion")
    compileOnly("org.graalvm.polyglot:polyglot:$graalVersion")
    compileOnly("org.graalvm.polyglot:js:$graalVersion")

    testImplementation("io.papermc.paper:paper-api:$paperVersion")
    testImplementation("com.google.code.gson:gson:$gsonVersion")
    testImplementation("org.graalvm.polyglot:polyglot:$graalVersion")
    testImplementation("org.graalvm.polyglot:js:$graalVersion")
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.release = 25
    options.encoding = "UTF-8"
}

tasks.processResources {
    from("allow-list.txt")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}

val configuredJavaVersion = java.toolchain.languageVersion.get().asInt()

val verifyJavaToolchain = tasks.register("verifyJavaToolchain") {
    group = "verification"
    description = "Fails unless the build is using the Java 25 toolchain the host requires."

    val languageVersion = configuredJavaVersion
    doLast {
        check(languageVersion >= 25) {
            "effectmc-host requires JDK 25 or newer, but the build toolchain is Java $languageVersion."
        }
        logger.lifecycle("effectmc-host builds on Java $languageVersion.")
    }
}

val verifyHostJar = tasks.register("verifyHostJar") {
    group = "verification"
    description = "Fails when Graal or Truffle classes are bundled into the host jar."

    val archive = tasks.jar.flatMap { it.archiveFile }
    inputs.file(archive)

    doLast {
        val forbiddenPrefixes = listOf("org/graalvm/", "com/oracle/truffle/")
        val leaked = ZipFile(archive.get().asFile).use { zip ->
            zip.entries().asSequence()
                .map { it.name }
                .filter { entry -> forbiddenPrefixes.any(entry::startsWith) }
                .toList()
        }
        check(leaked.isEmpty()) {
            "The host jar contains Graal classes (${leaked.take(5).joinToString()}). " +
                "The host must use the Paper PluginLoader rather than shading or relocating Graal."
        }
    }
}

tasks.check {
    dependsOn(verifyJavaToolchain, verifyHostJar)
}

val generateAllowList = tasks.register<Exec>("generateAllowList") {
    group = "build"
    description = "Regenerates allow-list.txt from the pinned Paper typings."

    val typings = layout.projectDirectory.file("../packages/paper-types/generated/index.d.ts").asFile
    inputs.file(typings)
    inputs.file("allow-list.extra.txt")
    outputs.file("allow-list.txt")

    workingDir = projectDir
    commandLine("node", "scripts/generate-allow-list.mjs")
}

val checkAllowList = tasks.register<Exec>("checkAllowList") {
    group = "verification"
    description = "Fails when allow-list.txt is stale relative to the pinned Paper typings."

    val typings = layout.projectDirectory.file("../packages/paper-types/generated/index.d.ts").asFile
    inputs.file(typings)
    inputs.file("allow-list.extra.txt")
    inputs.file("allow-list.txt")
    outputs.upToDateWhen { false }

    workingDir = projectDir
    commandLine("node", "scripts/generate-allow-list.mjs", "--check")
}

tasks.check {
    dependsOn(checkAllowList)
}
