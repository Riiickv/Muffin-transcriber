package expo.modules.storagerescue;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;

/**
 * Reads one value of the app's key-value storage in pieces.
 *
 * WHY. That storage (async-storage 2.2.0) is a SQLite database named RKStorage
 * with one table, catalystLocalStorage(key, value). Android hands a query's
 * row to the app through a 2,048 KB window, so a value past 2,097,099 bytes can
 * be written and can no longer be read: the read throws. Until 2026-11 every
 * transcription was one such value. docs/storage-research.md, sections 2 and 8.
 *
 * HOW. The length first, then substr() of at most PIECE characters per query.
 * A character is at most 4 bytes in UTF-8, so no piece comes near the window.
 * The result is checked against the length in characters AND in bytes, before
 * and after, so a value that changed meanwhile, or text that does not come back
 * exactly, throws instead of returning something close.
 *
 * Read only, on its own connection: this never creates, writes or deletes
 * anything. Plain Java with no React imports, so the same file runs in the
 * Robolectric test in docs/storage-probe.
 */
public final class RowReader {
  public static final String DATABASE = "RKStorage";
  static final String TABLE = "catalystLocalStorage";
  /** Characters per query: at most 800,000 bytes. */
  static final int PIECE = 200_000;

  private RowReader() {}

  /** The value stored under key, or null when there is no such value. Throws when it cannot be read whole. */
  public static String readStoredValue(Context context, String key) {
    File path = context.getDatabasePath(DATABASE);
    if (!path.exists()) return null;
    SQLiteDatabase db = SQLiteDatabase.openDatabase(
        path.getPath(), null, SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS);
    try {
      return read(db, key);
    } finally {
      db.close();
    }
  }

  /** The same, on a database that is already open. */
  public static String read(SQLiteDatabase db, String key) {
    long[] before = size(db, key);
    if (before == null) return null;
    long chars = before[0];
    StringBuilder out = new StringBuilder((int) Math.min(chars, Integer.MAX_VALUE - 8));
    for (long start = 1; start <= chars; start += PIECE) {
      // Both numbers are ours, not the caller's: written into the statement, not bound as text.
      String sql = "SELECT substr(value, " + start + ", " + PIECE + ") FROM " + TABLE + " WHERE key = ?";
      try (Cursor c = db.rawQuery(sql, new String[] {key})) {
        if (!c.moveToFirst()) throw new IllegalStateException("The value went away while it was read");
        String piece = c.getString(0);
        if (piece == null) throw new IllegalStateException("A piece of the value came back empty");
        out.append(piece);
      }
    }
    long[] after = size(db, key);
    if (after == null || after[0] != before[0] || after[1] != before[1]) {
      throw new IllegalStateException("The value changed while it was read");
    }
    String value = out.toString();
    // length() stops at a NUL character and substr() counts as it does, so a
    // value with a NUL would come back short and look whole. The byte count
    // does not stop there.
    if (value.codePointCount(0, value.length()) != chars || utf8Length(value) != before[1]) {
      throw new IllegalStateException("The value did not come back exactly as stored");
    }
    return value;
  }

  /** {characters, UTF-8 bytes} of the value, or null when there is no such key. */
  private static long[] size(SQLiteDatabase db, String key) {
    String sql = "SELECT length(value), length(CAST(value AS BLOB)) FROM " + TABLE + " WHERE key = ?";
    try (Cursor c = db.rawQuery(sql, new String[] {key})) {
      if (!c.moveToFirst() || c.isNull(0)) return null;
      return new long[] {c.getLong(0), c.getLong(1)};
    }
  }

  /** Bytes the text takes in UTF-8, the way SQLite stores it. */
  public static long utf8Length(String s) {
    long bytes = 0;
    for (int i = 0; i < s.length(); ) {
      int cp = s.codePointAt(i);
      i += Character.charCount(cp);
      bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    }
    return bytes;
  }
}
