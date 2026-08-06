# Android APK build

This project packages the Vite web app as an Android application with Capacitor.
The `android/` directory is the native Android Studio project; the game itself
continues to live in `src/`.

## One-time requirements

- Android Studio, including the Android SDK that matches the generated project.
- JDK 21. Android Studio's bundled JBR is supported.

If Java and the Android SDK are not already configured globally, set them for
the terminal session before building (adjust the paths if Android Studio is
installed elsewhere):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

## Development workflow

```powershell
npm run cap:sync
npm run android
```

`cap:sync` always runs the production web build first, then copies `dist/` to
the Android app assets. It also reapplies the Android Studio-compatible AGP
version to Capacitor's generated plugin project. Run it after changing any
web-game source or public asset. `android` opens the generated project in Android Studio for device or
emulator testing.

## Build artifacts

```powershell
npm run apk:debug
npm run apk:release
npm run aab:release
```

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Unsigned release APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- Release app bundle for Google Play: `android/app/build/outputs/bundle/release/app-release.aab`

Before distributing a release build, configure a signing key in Android Studio
or Gradle. Do not commit keystores, `key.properties`, APKs, or AABs.
