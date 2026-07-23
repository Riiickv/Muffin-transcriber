const { withMainActivity, withMainApplication } = require('expo/config-plugins');

/**
 * Injects the saved UI-scale density override into the generated native entry
 * points, so the whole app lays out against the scaled density from the very
 * first frame. The value itself is written by modules/ui-scale (Settings >
 * "UI size"); this plugin only makes it take effect at startup.
 *
 * Two injection points, both needed:
 *  - MainActivity.attachBaseContext: gives the ACTIVITY a scaled context, which
 *    is what most view inflation measures against.
 *  - MainApplication.onCreate: React Native reads some display metrics from the
 *    APPLICATION context, so its resources get the same override.
 *
 * Both compute from Resources.getSystem() - the device's true density,
 * untouched by our override - so restarts never compound the scale, and the
 * user's OS-level Display Size setting stays respected underneath.
 *
 * Survives `expo prebuild` because it runs as part of it (same reason
 * withReleaseSigning lives here). Guarded on a marker string so a non-clean
 * prebuild can't inject twice.
 */

const ACTIVITY_SNIPPET = `
  // @muffin-ui-scale: user UI size (Settings) applied before any layout.
  override fun attachBaseContext(newBase: android.content.Context) {
    val prefs = newBase.getSharedPreferences("muffin_ui_scale", android.content.Context.MODE_PRIVATE)
    val scale = prefs.getFloat("uiScale", 1f)
    if (scale != 1f) {
      val config = android.content.res.Configuration(newBase.resources.configuration)
      config.densityDpi = (android.content.res.Resources.getSystem().configuration.densityDpi * scale).toInt()
      super.attachBaseContext(newBase.createConfigurationContext(config))
    } else {
      super.attachBaseContext(newBase)
    }
  }
`;

const APPLICATION_SNIPPET = `
    // @muffin-ui-scale: RN reads some metrics from the application context.
    run {
      val prefs = getSharedPreferences("muffin_ui_scale", android.content.Context.MODE_PRIVATE)
      val scale = prefs.getFloat("uiScale", 1f)
      if (scale != 1f) {
        val config = android.content.res.Configuration(resources.configuration)
        config.densityDpi = (android.content.res.Resources.getSystem().configuration.densityDpi * scale).toInt()
        @Suppress("DEPRECATION")
        resources.updateConfiguration(config, resources.displayMetrics)
      }
    }
`;

module.exports = function withUiScale(config) {
  config = withMainActivity(config, (c) => {
    if (!c.modResults.contents.includes('@muffin-ui-scale')) {
      c.modResults.contents = c.modResults.contents.replace(
        'class MainActivity : ReactActivity() {',
        'class MainActivity : ReactActivity() {\n' + ACTIVITY_SNIPPET
      );
    }
    return c;
  });
  config = withMainApplication(config, (c) => {
    if (!c.modResults.contents.includes('@muffin-ui-scale')) {
      c.modResults.contents = c.modResults.contents.replace(
        'super.onCreate()',
        'super.onCreate()\n' + APPLICATION_SNIPPET
      );
    }
    return c;
  });
  return config;
};
