package expo.modules.uiscale

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val PREFS = "muffin_ui_scale"
private const val KEY = "uiScale"

/**
 * The user-facing UI scale (Settings > "UI size"): a density override, the same
 * mechanism as Android's own Display Size setting but per-app.
 *
 * The saved value is read at startup by MainActivity.attachBaseContext and
 * MainApplication.onCreate (both injected by plugins/withUiScale.js), so the
 * whole app lays out against the scaled density. Changing it here re-scales the
 * application resources and recreates the activity so it applies immediately.
 *
 * The scale is always computed from Resources.getSystem() - the device's real
 * density, untouched by our own override - so repeated changes never compound,
 * and the user's OS-level Display Size choice stays respected underneath ours.
 */
class UiScaleModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UiScale")

    Function("getUiScale") {
      val ctx = appContext.reactContext
      ctx?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.getFloat(KEY, 1f)?.toDouble() ?: 1.0
    }

    AsyncFunction("setUiScale") { scale: Double ->
      // Hard clamp: below ~0.85 tap targets drop under fingertip size, above
      // ~1.15 the layouts overflow. The JS side only offers 0.9 / 1.0 / 1.1.
      val clamped = scale.coerceIn(0.85, 1.15).toFloat()
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
      // commit(), not apply(): the recreate below re-reads the value at once,
      // and an async apply can lose that race.
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putFloat(KEY, clamped).commit()

      appContext.currentActivity?.let { activity ->
        activity.runOnUiThread {
          // The application's resources were scaled at process start with the
          // OLD value; re-scale them from the device base, then rebuild the UI.
          val appRes = activity.applicationContext.resources
          val config = Configuration(appRes.configuration)
          config.densityDpi = (Resources.getSystem().configuration.densityDpi * clamped).toInt()
          @Suppress("DEPRECATION")
          appRes.updateConfiguration(config, appRes.displayMetrics)
          activity.recreate()
        }
      }
    }
  }
}
