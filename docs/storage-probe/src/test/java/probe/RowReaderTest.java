package probe;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;
import expo.modules.storagerescue.RowReader;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.SQLiteMode;

/**
 * The reader in mobile_app/modules/storage-rescue, run against Android 14's
 * SQLite and cursor window (Robolectric native mode), on a database made the
 * way async-storage 2.2.0 makes it. Same environment as RowLimitProbe.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, manifest = Config.NONE)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
public class RowReaderTest {
  static final String KEY = "muffin.history.v1";

  /** async-storage's own helper, kept open the whole time, as it is in the app. */
  static class Library extends SQLiteOpenHelper {
    Library(Context c) { super(c, RowReader.DATABASE, null, 1); }
    @Override public void onCreate(SQLiteDatabase db) {
      db.execSQL("CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int o, int n) {}
  }

  Context context;
  SQLiteDatabase library;

  @Before public void open() {
    context = RuntimeEnvironment.getApplication();
    context.deleteDatabase(RowReader.DATABASE);
    library = new Library(context).getWritableDatabase();
    library.setMaximumSize(6L * 1024 * 1024);
  }

  @After public void close() {
    library.close();
    context.deleteDatabase(RowReader.DATABASE);
  }

  /** AsyncStorageModule.multiSet for one pair. */
  void set(String key, String value) {
    SQLiteStatement st = library.compileStatement("INSERT OR REPLACE INTO catalystLocalStorage VALUES (?, ?);");
    library.beginTransaction();
    try {
      st.bindString(1, key);
      st.bindString(2, value);
      st.execute();
      library.setTransactionSuccessful();
    } finally {
      library.endTransaction();
    }
  }

  /** AsyncStorageModule.multiGet for one key: the read that fails. */
  String libraryRead(String key) {
    try (Cursor c = library.rawQuery("SELECT key, value FROM catalystLocalStorage WHERE key IN (?)", new String[] {key})) {
      return c.moveToFirst() ? c.getString(1) : null;
    }
  }

  static String repeat(String s, int times) {
    StringBuilder b = new StringBuilder(s.length() * times);
    for (int i = 0; i < times; i++) b.append(s);
    return b.toString();
  }

  @Test public void aValueTheLibraryCannotReadComesBackWhole() {
    // A list of notes the way JSON.stringify writes it, in Italian, with emoji (two Java chars each).
    String note = "{\"id\":\"1760000000001\",\"rawTranscript\":\"perché \\\"così\\\" è più lungo 🎙️ € \\\\ fine\\n\"},";
    String value = "[" + repeat(note, 40_000) + "{\"id\":\"x\"}]";
    assertTrue(RowReader.utf8Length(value) > 3_000_000);
    set(KEY, value);
    try {
      libraryRead(KEY);
      fail("the library's own read was expected to fail at this size");
    } catch (RuntimeException expected) {
      assertTrue(expected.toString(), expected.toString().contains("Row too big to fit into CursorWindow"));
    }
    assertEquals(value, RowReader.readStoredValue(context, KEY));
    System.out.println("RESCUE read " + value.length() + " chars, " + RowReader.utf8Length(value) + " bytes: identical");
  }

  @Test public void theLargestValueTheDatabaseHolds() {
    String value = repeat("x", 6_000_000);
    set(KEY, value);
    assertEquals(value, RowReader.readStoredValue(context, KEY));
  }

  @Test public void lengthsAroundAPieceBoundary() {
    for (int n : new int[] {1, 199_999, 200_000, 200_001, 400_000, 600_001}) {
      // An emoji at the very end and start of each piece: pieces are whole characters.
      String value = repeat("🎙", n);
      set(KEY, value);
      assertEquals("length " + n, value, RowReader.readStoredValue(context, KEY));
    }
  }

  @Test public void smallAndEmptyValues() {
    set(KEY, "[]");
    assertEquals("[]", RowReader.readStoredValue(context, KEY));
    set(KEY, "");
    assertEquals("", RowReader.readStoredValue(context, KEY));
  }

  @Test public void noSuchKeyIsNull() {
    set("another.key", "1");
    assertNull(RowReader.readStoredValue(context, KEY));
  }

  @Test public void noDatabaseIsNullAndNothingIsCreated() {
    library.close();
    context.deleteDatabase(RowReader.DATABASE);
    assertNull(RowReader.readStoredValue(context, KEY));
    assertTrue(!context.getDatabasePath(RowReader.DATABASE).exists());
    library = new Library(context).getWritableDatabase();
  }

  @Test public void aValueThatWouldComeBackShortThrows() {
    // length() and substr() stop at a NUL character. The byte count does not.
    set(KEY, repeat("a", 300_000) + "\u0000" + repeat("b", 300_000));
    try {
      String got = RowReader.readStoredValue(context, KEY);
      fail("expected a throw, got " + (got == null ? "null" : got.length() + " chars"));
    } catch (IllegalStateException expected) {
      System.out.println("RESCUE NUL case: " + expected.getMessage());
    }
  }

  @Test public void theLibraryKeepsWorkingAfterwards() {
    String value = repeat("y", 3_000_000);
    set(KEY, value);
    assertEquals(value, RowReader.readStoredValue(context, KEY));
    set("small", "1");
    assertEquals("1", libraryRead("small"));
    library.delete("catalystLocalStorage", "key = ?", new String[] {KEY});
    assertNull(RowReader.readStoredValue(context, KEY));
  }
}
