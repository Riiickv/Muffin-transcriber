const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Release signing that SURVIVES `expo prebuild --clean`.
 *
 * The obvious way to sign a release - edit android/app/build.gradle by hand -
 * silently unravels here: this project's build script regenerates android/
 * from app.json (`--prebuild`), which wipes manual edits and quietly reverts
 * to the debug key. You would only find out when Play rejects the upload, or
 * worse, not find out.
 *
 * This plugin re-injects the signing config on every prebuild instead. The
 * credentials live in ~/.gradle/gradle.properties - OUTSIDE the repo, never
 * committed, never printed:
 *
 *   MUFFIN_UPLOAD_STORE_FILE=C:\\Users\\you\\muffin-upload.jks
 *   MUFFIN_UPLOAD_STORE_PASSWORD=...
 *   MUFFIN_UPLOAD_KEY_ALIAS=muffin
 *   MUFFIN_UPLOAD_KEY_PASSWORD=...
 *
 * When those properties are absent the build falls back to the debug key, so
 * development machines and CI keep working with zero setup - they just can't
 * produce a Play-uploadable artifact, which is the correct failure.
 */
const RELEASE_SIGNING = `        release {
            if (project.hasProperty('MUFFIN_UPLOAD_STORE_FILE')) {
                storeFile file(MUFFIN_UPLOAD_STORE_FILE)
                storePassword MUFFIN_UPLOAD_STORE_PASSWORD
                keyAlias MUFFIN_UPLOAD_KEY_ALIAS
                keyPassword MUFFIN_UPLOAD_KEY_PASSWORD
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    if (gradle.includes('MUFFIN_UPLOAD_STORE_FILE')) {
      return cfg; // already applied (idempotent)
    }

    // 1. Add the release entry to signingConfigs, right after the debug one.
    const debugBlock = `            keyPassword 'android'
        }
    }`;
    if (!gradle.includes(debugBlock)) {
      throw new Error(
        'withReleaseSigning: signingConfigs.debug block not found - the RN template changed, update the plugin.'
      );
    }
    gradle = gradle.replace(
      debugBlock,
      `            keyPassword 'android'
        }
${RELEASE_SIGNING}    }`
    );

    // 2. Point the release buildType at it when the keystore is configured.
    //    Matched WITH the template's comment so we can't touch the debug
    //    buildType's identical line.
    const releaseLine = `            signingConfig signingConfigs.debug
            def enableShrinkResources`;
    if (!gradle.includes(releaseLine)) {
      throw new Error(
        'withReleaseSigning: release buildType anchor not found - the RN template changed, update the plugin.'
      );
    }
    gradle = gradle.replace(
      releaseLine,
      `            signingConfig project.hasProperty('MUFFIN_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug
            def enableShrinkResources`
    );

    cfg.modResults.contents = gradle;
    return cfg;
  });
};
