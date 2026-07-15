@echo off
setlocal EnableDelayedExpansion
REM ===========================================================================
REM  Muffin Transcriber - Android release build
REM
REM  Usage:
REM     build-android.bat              Build the release APK
REM     build-android.bat --clean      Wipe build caches first (slow, ~15 min)
REM     build-android.bat --install     Build, then install to the plugged-in phone
REM     build-android.bat --serve      Build, then host the APK over Wi-Fi
REM     build-android.bat --prebuild   Regenerate android/ from app.json first
REM     build-android.bat --aab        Build the .aab for the Play Store (not an APK)
REM
REM  Flags can be combined:  build-android.bat --clean --install
REM ===========================================================================

cd /d "%~dp0"
set "FAILED="
set "DO_CLEAN="
set "DO_INSTALL="
set "DO_SERVE="
set "DO_PREBUILD="

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--clean"    set "DO_CLEAN=1"
if /i "%~1"=="--install"  set "DO_INSTALL=1"
if /i "%~1"=="--serve"    set "DO_SERVE=1"
if /i "%~1"=="--prebuild" set "DO_PREBUILD=1"
if /i "%~1"=="--aab"      set "DO_AAB=1"
if /i "%~1"=="--help"     goto show_help
if /i "%~1"=="-h"         goto show_help
shift
goto parse_args
:args_done

echo.
echo ===========================================================
echo   MUFFIN TRANSCRIBER - ANDROID RELEASE BUILD
echo ===========================================================
echo.

REM ---------------------------------------------------------------------------
REM  1. JDK 21
REM     RN 0.86 + react-native-worklets CMake fails on JDK 25 with
REM     "A restricted method in java.lang.System has been called".
REM     JDK 17 is too old for AGP here. It has to be 21.
REM ---------------------------------------------------------------------------
echo [1/6] Locating JDK 21...
set "JDK21="
for %%D in (
  "C:\Program Files\Microsoft\jdk-21.0.6.7-hotspot"
  "C:\Program Files\Eclipse Adoptium\jdk-21"
  "C:\Program Files\Android\Android Studio\jbr"
) do (
  if exist "%%~D\bin\java.exe" if not defined JDK21 set "JDK21=%%~D"
)
REM Fall back to scanning for any jdk-21* install.
if not defined JDK21 (
  for /d %%D in ("C:\Program Files\Microsoft\jdk-21*" "C:\Program Files\Eclipse Adoptium\jdk-21*") do (
    if exist "%%~D\bin\java.exe" if not defined JDK21 set "JDK21=%%~D"
  )
)
if not defined JDK21 (
  echo       ERROR: No JDK 21 found.
  echo       Install it:  winget install Microsoft.OpenJDK.21
  echo       The build will NOT work on JDK 25 ^(worklets CMake fails^).
  set "FAILED=1"
  goto :summary
)
set "JAVA_HOME=%JDK21%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
REM Version via a temp file: piping a quoted path with spaces straight into
REM for /f makes cmd choke on "C:\Program".
"%JAVA_HOME%\bin\java.exe" -version 2>"%TEMP%\muffin_jver.txt"
set "JVER=?"
for /f "tokens=3" %%v in ('findstr /i "version" "%TEMP%\muffin_jver.txt" 2^>nul') do (
  if "!JVER!"=="?" set "JVER=%%~v"
)
del "%TEMP%\muffin_jver.txt" 2>nul
echo       OK: java !JVER!  ^(%JAVA_HOME%^)

REM ---------------------------------------------------------------------------
REM  2. Android SDK
REM ---------------------------------------------------------------------------
echo [2/6] Locating Android SDK...
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools\adb.exe" (
  echo       ERROR: Android SDK not found at %ANDROID_HOME%
  echo       Install Android Studio, or set ANDROID_HOME yourself.
  set "FAILED=1"
  goto :summary
)
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
echo       OK: %ANDROID_HOME%

REM ---------------------------------------------------------------------------
REM  3. ninja >= 1.12
REM     The SDK ships 1.10.2, which dies on RN 0.86 new-arch codegen paths
REM     (~360 chars) with "Filename longer than 260 characters" even when
REM     Windows LongPathsEnabled=1. 1.12+ handles long paths.
REM ---------------------------------------------------------------------------
echo [3/6] Checking ninja version...
set "NINJA=%ANDROID_HOME%\cmake\3.22.1\bin\ninja.exe"
if not exist "%NINJA%" (
  echo       WARN: ninja not found at expected path - skipping check.
  echo             If the build dies on "Filename longer than 260 characters",
  echo             replace it with ninja 1.12+ from Visual Studio.
) else (
  for /f "tokens=1,2 delims=." %%a in ('"%NINJA%" --version 2^>nul') do (
    set "NJ_MAJOR=%%a"
    set "NJ_MINOR=%%b"
  )
  set "NJ_OK="
  if !NJ_MAJOR! GTR 1 set "NJ_OK=1"
  if !NJ_MAJOR! EQU 1 if !NJ_MINOR! GEQ 12 set "NJ_OK=1"
  if not defined NJ_OK (
    echo       ERROR: ninja is !NJ_MAJOR!.!NJ_MINOR! - need 1.12 or newer.
    echo       Fix: copy ninja.exe 1.12+ from Visual Studio over
    echo            %NINJA%
    echo       ^(VS ships it at: C:\Program Files\Microsoft Visual Studio\2022\
    echo        Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\^)
    set "FAILED=1"
    goto :summary
  )
  echo       OK: ninja !NJ_MAJOR!.!NJ_MINOR!
)

REM ---------------------------------------------------------------------------
REM  4. Dependencies
REM     postinstall runs patch-package, which applies whisper.rn+0.6.0.patch.
REM     Without it whisper is broken - never skip it.
REM ---------------------------------------------------------------------------
echo [4/6] Checking dependencies...
if not exist "node_modules" (
  echo       node_modules missing - running npm install...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo       ERROR: npm install failed.
    set "FAILED=1"
    goto :summary
  )
) else (
  echo       OK: node_modules present
)
if not exist "node_modules\whisper.rn" (
  echo       ERROR: whisper.rn missing. Run: npm install --legacy-peer-deps
  set "FAILED=1"
  goto :summary
)

REM ---------------------------------------------------------------------------
REM  5. Prebuild (only when asked - it overwrites android/)
REM ---------------------------------------------------------------------------
echo [5/6] Native project...
if defined DO_PREBUILD (
  echo       Regenerating android/ from app.json...
  call npx expo prebuild --platform android --clean
  if errorlevel 1 (
    echo       ERROR: prebuild failed.
    set "FAILED=1"
    goto :summary
  )
) else (
  if not exist "android\gradlew.bat" (
    echo       android/ missing - running prebuild...
    call npx expo prebuild --platform android
    if errorlevel 1 (
      echo       ERROR: prebuild failed.
      set "FAILED=1"
      goto :summary
    )
  ) else (
    echo       OK: android/ exists ^(pass --prebuild to regenerate^)
  )
)

REM ---------------------------------------------------------------------------
REM  6. Gradle
REM     --no-daemon: the daemon caches JAVA_HOME, so a stale JDK-25 daemon will
REM     keep failing even after you fix JAVA_HOME.
REM     arm64-v8a only: every real phone since ~2017. Cuts build time ~4x.
REM ---------------------------------------------------------------------------
echo [6/6] Building release APK...
if defined DO_CLEAN (
  echo       Cleaning...
  pushd android
  call .\gradlew.bat clean --no-daemon
  popd
  if exist "android\.cxx" rmdir /s /q "android\.cxx"
  if exist "android\app\.cxx" rmdir /s /q "android\app\.cxx"
)
echo       This takes 5-15 minutes. Go make a coffee.
echo.
pushd android
REM Explicit .\ — some environments set NoDefaultCurrentDirectoryInExePath=1,
REM which stops cmd searching the current dir, so a bare `gradlew.bat` gives
REM "not recognized" even while standing in android\.
REM Play Store takes an App Bundle, not an APK - it has been required for new
REM apps since 2021. Same build, different Gradle task, so --aab produces the
REM upload artifact while the default still gives an APK you can sideload.
if defined DO_AAB (
  call .\gradlew.bat bundleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
) else (
  call .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
)
set "GRADLE_EXIT=!errorlevel!"
popd
if not "!GRADLE_EXIT!"=="0" (
  echo.
  echo       ERROR: Gradle build failed ^(exit !GRADLE_EXIT!^).
  echo       Common fixes:
  echo         - "restricted method in java.lang.System" ..: wrong JDK, need 21
  echo         - "Filename longer than 260 characters" ....: ninja too old
  echo         - Random C++ / codegen errors ..............: retry with --clean
  set "FAILED=1"
  goto :summary
)

if defined DO_AAB (
  set "AAB=%CD%\android\app\build\outputs\bundle\release\app-release.aab"
  if not exist "!AAB!" (
    echo       ERROR: Gradle said OK but no .aab at !AAB!
    set "FAILED=1"
    goto :summary
  )
  for %%A in ("!AAB!") do set /a AABMB=%%~zA/1048576
  echo.
  echo ===========================================================
  echo   BUILD OK - Play Store bundle
  echo.
  echo   AAB:  !AAB!
  echo   Size: !AABMB! MB
  echo.
  echo   Upload this file at play.google.com/console.
  echo   NOTE: it is signed with the DEBUG key until you set up your own
  echo         keystore - Play will reject it until then.
  echo ===========================================================
  goto :eof
)

set "OUTDIR=android\app\build\outputs\apk\release"
set "APKNAME=muffin_transcriber.apk"
set "APK=%OUTDIR%\app-release.apk"
if not exist "%APK%" (
  echo       ERROR: Gradle said OK but no APK at %APK%
  set "FAILED=1"
  goto :summary
)

REM Gradle always names it app-release.apk. Rename it to something a human
REM recognises in their Downloads folder. MOVE, not copy: a stale
REM app-release.apk left beside it would still be served by the http server
REM below, and grabbing the wrong one means installing an old build.
move /y "%APK%" "%OUTDIR%\%APKNAME%" >nul
if errorlevel 1 (
  echo       ERROR: could not rename the APK to %APKNAME%
  set "FAILED=1"
  goto :summary
)
set "APK=%OUTDIR%\%APKNAME%"

REM ---------------------------------------------------------------------------
REM  Optional: install / serve
REM ---------------------------------------------------------------------------
if defined DO_INSTALL (
  echo.
  echo Installing to device...
  "%ANDROID_HOME%\platform-tools\adb.exe" install -r "%APK%"
  if errorlevel 1 (
    echo       WARN: install failed. Is USB debugging on and the phone plugged in?
    echo             Check with: adb devices
  ) else (
    echo       Installed.
  )
)

if defined DO_SERVE (
  echo.
  REM Parsing `ipconfig` lists every adapter — link-local, VirtualBox, WSL —
  REM so you'd get 6 URLs and have to guess. Ask Windows for the adapter that
  REM actually holds the default route instead: that's the one the phone
  REM shares a network with.
  REM Two batch traps here, both learned the hard way:
  REM  - usebackq/backticks, because the PowerShell needs single quotes
  REM    around 'Up' and those would collide with for /f's '...' delimiters.
  REM  - NO pipes: inside backticks cmd does NOT consume the ^ escape, so a
  REM    `^|` arrives at PowerShell literally and it errors out. Hence
  REM    .Where({...}) instead of | Where-Object {...}.
  set "LANIP="
  for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration).Where({$_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up'})[0].IPv4Address.IPAddress"`) do set "LANIP=%%i"

  if not defined LANIP (
    echo       WARN: couldn't detect the Wi-Fi IP. Run ipconfig and use the
    echo             address on the same network as your phone.
    set "LANIP=YOUR-PC-IP"
  )
  echo ===========================================================
  echo   Open this on your phone ^(same Wi-Fi^):
  echo.
  echo       http://!LANIP!:8080/!APKNAME!
  echo.
  echo   Ctrl+C here to stop the server.
  echo ===========================================================
  pushd android\app\build\outputs\apk\release
  python -m http.server 8080
  popd
)

:summary
echo.
echo ===========================================================
if defined FAILED (
  echo   BUILD FAILED - see the error above.
  echo ===========================================================
  exit /b 1
)
for %%A in ("%APK%") do set "APK_MB=%%~zA"
set /a APK_MB=!APK_MB! / 1048576
echo   BUILD OK
echo.
echo   APK:  %CD%\%APK%
echo   Size: !APK_MB! MB
echo.
echo   Install it:  build-android.bat --install
echo   Send to phone over Wi-Fi:  build-android.bat --serve
echo ===========================================================
exit /b 0

:show_help
echo.
echo Muffin Transcriber - Android build
echo.
echo   build-android.bat              Build the release APK
echo   build-android.bat --clean      Wipe caches first ^(slow, fixes weird errors^)
echo   build-android.bat --install    Build then install to plugged-in phone
echo   build-android.bat --serve      Build then host over Wi-Fi for the phone
echo   build-android.bat --prebuild   Regenerate android/ from app.json first
echo.
echo Flags combine:  build-android.bat --clean --install
echo.
exit /b 0
