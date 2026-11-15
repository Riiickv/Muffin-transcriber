package expo.modules.storagerescue

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads a value of the app's key-value storage that is too large for the
 * storage library to read back (past 2,097,099 bytes on Android). The work is
 * in RowReader.java; this only hands it to JavaScript.
 */
class StorageRescueModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StorageRescue")

    AsyncFunction("readStoredValue") { key: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      RowReader.readStoredValue(context, key)
    }
  }
}
