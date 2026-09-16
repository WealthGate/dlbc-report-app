param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot "android"
$apkSource = Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk"
$artifactDirectory = Join-Path $projectRoot "artifacts"
$apkDestination = Join-Path $artifactDirectory "DLBC-Reporting-debug.apk"

function Find-Java21Home {
  $candidates = @(
    $env:JAVA_HOME,
    "C:\Program Files\Android\Android Studio\jbr"
  )
  $candidates += Get-ChildItem "C:\Program Files\Microsoft" -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName
  $candidates += Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not $candidate) { continue }
    $javaExecutable = Join-Path $candidate "bin\java.exe"
    if (-not (Test-Path -LiteralPath $javaExecutable)) { continue }
    $versionText = (& $javaExecutable --version | Out-String)
    if ($versionText -match 'version "21(?:\.|\")' -or $versionText -match 'openjdk 21(?:\.|\s)') {
      return $candidate
    }
  }
  return $null
}

$javaHome = Find-Java21Home
if (-not $javaHome) {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Java 21 is required and Windows Package Manager was not found. Install Microsoft OpenJDK 21, then run this command again."
  }
  Write-Host "Java 21 is required. Installing Microsoft OpenJDK 21..." -ForegroundColor Cyan
  & $winget.Source install --id Microsoft.OpenJDK.21 --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Microsoft OpenJDK 21 could not be installed automatically."
  }
  $javaHome = Find-Java21Home
  if (-not $javaHome) {
    throw "Microsoft OpenJDK 21 was installed but its Java folder could not be located. Open a new terminal and run this command again."
  }
}

if (-not (Test-Path -LiteralPath $androidRoot)) {
  throw "The Android project is missing. Run 'npx cap add android' once, then try again."
}

$env:JAVA_HOME = $javaHome
$env:Path = "$(Join-Path $javaHome 'bin');$env:Path"

Push-Location $projectRoot
try {
  # Cloud-folder copies can mark generated directories read-only, preventing
  # Capacitor from replacing its assets. Only touch these generated trees.
  foreach ($relativeGeneratedPath in @("android\app\src\main\assets\public", "android\capacitor-cordova-android-plugins")) {
    $generatedPath = Join-Path $projectRoot $relativeGeneratedPath
    if (-not (Test-Path -LiteralPath $generatedPath)) { continue }
    $resolvedGeneratedPath = (Resolve-Path -LiteralPath $generatedPath).Path
    if (-not $resolvedGeneratedPath.StartsWith($projectRoot + "\", [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to change attributes outside this project's generated Android folders."
    }
    $generatedItems = @(Get-Item -LiteralPath $resolvedGeneratedPath) + @(Get-ChildItem -LiteralPath $resolvedGeneratedPath -Recurse -Force)
    foreach ($generatedItem in $generatedItems) {
      $generatedItem.Attributes = $generatedItem.Attributes -band (-bnot [IO.FileAttributes]::ReadOnly)
    }
  }
  & npm.cmd run android:sync
  if ($LASTEXITCODE -ne 0) {
    throw "The Capacitor sync failed."
  }

  Push-Location $androidRoot
  try {
    $cachedGradle = Get-ChildItem (Join-Path $env:USERPROFILE ".gradle\wrapper\dists\gradle-8.11.1-all") `
      -Filter "gradle.bat" -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
    if ($cachedGradle) {
      & $cachedGradle assembleDebug
    } else {
      & .\gradlew.bat assembleDebug
    }
    if ($LASTEXITCODE -ne 0) {
      throw "The Android APK build failed."
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $apkSource)) {
    throw "Gradle completed but the expected APK was not found at $apkSource."
  }

  New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
  Copy-Item -LiteralPath $apkSource -Destination $apkDestination -Force
  Write-Host "APK ready: $apkDestination" -ForegroundColor Green

  if ($Install) {
    $sdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android\Sdk"))
    $adbCandidates = @($sdkCandidates | Where-Object { $_ } | ForEach-Object { Join-Path $_ "platform-tools\adb.exe" })
    $adb = $adbCandidates |
      Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
      Select-Object -First 1
    if (-not $adb) {
      throw "ADB was not found. The APK was built, but it could not be installed automatically."
    }
    & $adb install -r $apkDestination
    if ($LASTEXITCODE -ne 0) {
      throw "ADB could not install the APK. Confirm USB debugging and authorize this computer on the phone."
    }
    Write-Host "DLBC Reporting was installed on the connected Android device." -ForegroundColor Green
  }
} finally {
  Pop-Location
}
