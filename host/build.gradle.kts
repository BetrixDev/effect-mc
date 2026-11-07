import java.util.zip.ZipFile
import org.gradle.process.CommandLineArgumentProvider

plugins {
    java
}

group = "dev.effectmc"
version = "0.1.0"

val paperVersion = "26.3.build.230-stable"
// Keep in sync with GRAAL_VERSION in GraalLibraryLoader.
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

val packerClasspath = configurations.create("packerClasspath") {
    isCanBeConsumed = false
    isCanBeResolved = true
}

dependencies {
    // Paper and Graal are provided by the server at runtime. Nothing is shaded.
    compileOnly("io.papermc.paper:paper-api:$paperVersion")
    compileOnly("com.google.code.gson:gson:$gsonVersion")
    compileOnly("org.graalvm.polyglot:polyglot:$graalVersion")
    compileOnly("org.graalvm.polyglot:js:$graalVersion")

    // The packContainer tool reads plugin.json, so it needs Gson without the
    // paper-api or Graal jars the host itself never bundles.
    packerClasspath("com.google.code.gson:gson:$gsonVersion")

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

tasks.compileJava {
    doFirst {
        val compilerVersion = javaCompiler.get().metadata.languageVersion.asInt()
        check(compilerVersion >= 25) {
            "effectmc-host requires JDK 25 or newer, but the resolved compiler is Java $compilerVersion."
        }
        logger.lifecycle("effectmc-host compiles on Java $compilerVersion.")
    }
}

val verifyHostJar = tasks.register("verifyHostJar") {
    group = "verification"
    description = "Fails when Graal or Truffle classes are bundled into the host jar."

    val archive = tasks.jar.flatMap { it.archiveFile }
    inputs.file(archive)

    doLast {
        val forbiddenPrefixes = listOf("org/graalvm/", "com/oracle/")
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
    dependsOn(verifyHostJar)
}

val packContainer = tasks.register<JavaExec>("packContainer") {
    group = "build"
    description = "Packs a loose container directory into <name>.jar. Defaults to examples/hello-container."

    dependsOn(tasks.classes)

    classpath = sourceSets.main.get().output + packerClasspath
    mainClass.set("dev.effectmc.host.container.PackContainerTool")

    val containerSource = providers.gradleProperty("container")
        .orElse(layout.projectDirectory.dir("examples/hello-container").asFile.absolutePath)
    val containerOutput = layout.buildDirectory.dir("containers")
    outputs.dir(containerOutput)

    argumentProviders.add(CommandLineArgumentProvider {
        listOf(containerSource.get(), containerOutput.get().asFile.absolutePath)
    })
}

tasks.assemble {
    dependsOn(packContainer)
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
