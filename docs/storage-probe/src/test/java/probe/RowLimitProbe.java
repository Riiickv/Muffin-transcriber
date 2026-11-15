package probe;

import android.content.Context;
import android.content.res.Resources;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;
import android.os.Build;
import java.util.Arrays;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.SQLiteMode;

/**
 * Probe, not a regression test: prints what Android's SQLite does with the
 * exact statements async-storage 2.2.0 runs (AsyncStorageModule.multiSet and
 * multiGet, ReactDatabaseSupplier's table and 6 MB cap).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, manifest = Config.NONE)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class RowLimitProbe {
  static final String KEY = "muffin.history.v1";
  static final long CAP = 6L * 1024L * 1024L;

  static class Supplier extends SQLiteOpenHelper {
    Supplier(Context c, String name) { super(c, name, null, 1); }
    @Override public void onCreate(SQLiteDatabase db) {
      db.execSQL("CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int o, int n) {}
  }

  static SQLiteDatabase open(String name) {
    Context c = RuntimeEnvironment.getApplication();
    c.deleteDatabase(name);
    SQLiteDatabase db = new Supplier(c, name).getWritableDatabase();
    db.setMaximumSize(CAP);
    return db;
  }

  /** The statements of AsyncStorageModule.multiSet, for one pair. Null on success. */
  static String set(SQLiteDatabase db, String key, String value) {
    SQLiteStatement st = db.compileStatement("INSERT OR REPLACE INTO catalystLocalStorage VALUES (?, ?);");
    String error = null;
    try {
      db.beginTransaction();
      st.clearBindings();
      st.bindString(1, key);
      st.bindString(2, value);
      st.execute();
      db.setTransactionSuccessful();
    } catch (Exception e) {
      error = e.getClass().getName() + ": " + e.getMessage();
    } finally {
      try {
        db.endTransaction();
      } catch (Exception e) {
        if (error == null) error = "endTransaction " + e.getClass().getName() + ": " + e.getMessage();
      }
    }
    return error;
  }

  /** The calls of AsyncStorageModule.multiGet, for one key. Null on success. */
  static String get(SQLiteDatabase db, String key, int[] outChars) {
    Cursor cursor = db.query("catalystLocalStorage", new String[] {"key", "value"},
        "key IN (?)", new String[] {key}, null, null, null);
    try {
      if (cursor.getCount() != 1) return "MISSING";
      if (cursor.moveToFirst()) {
        do {
          cursor.getString(0);
          String v = cursor.getString(1);
          if (outChars != null) outChars[0] = v.length();
        } while (cursor.moveToNext());
      }
      return null;
    } catch (Exception e) {
      return e.getClass().getName() + ": " + e.getMessage();
    } finally {
      cursor.close();
    }
  }

  static String repeat(char ch, int n) {
    char[] a = new char[n];
    Arrays.fill(a, ch);
    return new String(a);
  }

  static String pragma(SQLiteDatabase db, String name) {
    try (Cursor c = db.rawQuery("PRAGMA " + name, null)) {
      return c.moveToFirst() ? c.getString(0) : "(none)";
    }
  }

  static void out(String s) { System.out.println("PROBE " + s); }

  @Test public void a_environment() {
    SQLiteDatabase db = open("env");
    Resources r = Resources.getSystem();
    int id = r.getIdentifier("config_cursorWindowSize", "integer", "android");
    out("sdk_int=" + Build.VERSION.SDK_INT + " os.name=" + System.getProperty("os.name"));
    out("config_cursorWindowSize_kb=" + (id == 0 ? "not found" : String.valueOf(r.getInteger(id))));
    try (Cursor c = db.rawQuery("SELECT sqlite_version()", null)) {
      c.moveToFirst();
      out("sqlite_version=" + c.getString(0));
    }
    out("page_size=" + pragma(db, "page_size") + " journal_mode=" + pragma(db, "journal_mode")
        + " encoding=" + pragma(db, "encoding") + " max_page_count=" + pragma(db, "max_page_count"));
    out("getMaximumSize=" + db.getMaximumSize());
    db.close();
  }

  /** Largest value, in characters of ch, that multiGet's calls still read. */
  static int bisectRead(SQLiteDatabase db, char ch, int lo, int hi) {
    // invariant: lo reads, hi does not
    while (hi - lo > 1) {
      int mid = lo + (hi - lo) / 2;
      String w = set(db, KEY, repeat(ch, mid));
      if (w != null) throw new IllegalStateException("write failed at " + mid + ": " + w);
      if (get(db, KEY, null) == null) lo = mid; else hi = mid;
    }
    return lo;
  }

  @Test public void b_readThreshold() {
    SQLiteDatabase db = open("read");
    int[] chars = new int[1];
    for (int n : new int[] {1_000_000, 1_900_000, 2_000_000, 2_090_000, 2_097_152, 2_200_000, 3_000_000, 5_000_000}) {
      String w = set(db, KEY, repeat('a', n));
      String g = get(db, KEY, chars);
      out("ascii n=" + n + " write=" + (w == null ? "ok" : w) + " read=" + (g == null ? "ok chars=" + chars[0] : g));
    }
    int maxAscii = bisectRead(db, 'a', 2_000_000, 2_200_000);
    out("largest_readable_ascii_chars=" + maxAscii + " (1 byte each in UTF-8)");
    set(db, KEY, repeat('a', maxAscii + 1));
    out("one_more_char_read=" + get(db, KEY, null));
    int maxE = bisectRead(db, 'è', 900_000, 1_200_000);
    out("largest_readable_e_grave_chars=" + maxE + " (2 bytes each in UTF-8) utf8_bytes=" + (2L * maxE));
    int maxEuro = bisectRead(db, '€', 600_000, 800_000);
    out("largest_readable_euro_chars=" + maxEuro + " (3 bytes each in UTF-8) utf8_bytes=" + (3L * maxEuro));
    // The database is fine afterwards: another key still reads.
    set(db, KEY, repeat('a', 2_500_000));
    out("small_key_write=" + set(db, "muffin.settings.v1", "{\"a\":1}") + " small_key_read="
        + get(db, "muffin.settings.v1", null) + " big_key_read=" + get(db, KEY, null));
    db.close();
  }

  @Test public void c_sizeCap() {
    SQLiteDatabase db = open("cap");
    // Largest single value that can be written into an empty database.
    int lo = 1_000_000;
    int hi = 8_000_000;
    String firstError = null;
    while (hi - lo > 1024) {
      int mid = lo + (hi - lo) / 2;
      db.delete("catalystLocalStorage", null, null);
      String w = set(db, KEY, repeat('a', mid));
      if (w == null) {
        lo = mid;
      } else {
        hi = mid;
        firstError = w;
      }
    }
    out("largest_single_value_written=" + lo + " next_error=" + firstError);

    // Does replacing a large row need room for both copies?
    for (int n : new int[] {2_000_000, 2_900_000, 3_100_000, 4_000_000, 5_500_000}) {
      db.delete("catalystLocalStorage", null, null);
      String first = set(db, KEY, repeat('a', n));
      String second = set(db, KEY, repeat('b', n + 1000));
      String third = set(db, KEY, repeat('c', n + 2000));
      out("replace n=" + n + " first=" + (first == null ? "ok" : first) + " second=" + (second == null ? "ok" : second)
          + " third=" + (third == null ? "ok" : third));
    }

    // Many keys: where does the whole database stop?
    db.delete("catalystLocalStorage", null, null);
    String chunk = repeat('a', 100_000);
    int written = 0;
    String err = null;
    for (int i = 0; i < 200; i++) {
      err = set(db, "k" + i, chunk);
      if (err != null) break;
      written++;
    }
    out("rows_of_100000_written=" + written + " total_chars=" + (written * 100_000L) + " error=" + err);
    // After the cap is hit, does a small write still go in, and does an old key read?
    out("after_full small_write=" + set(db, "tiny", "x") + " read_k0=" + get(db, "k0", null));
    out("page_count=" + pragma(db, "page_count") + " freelist_count=" + pragma(db, "freelist_count"));
    db.close();
  }

  @Test public void d_readInPieces() {
    SQLiteDatabase db = open("pieces");
    StringBuilder sb = new StringBuilder(5_100_000);
    String unit = "caffè € 0123456789 abcdefghij\\n\"q\" ";
    while (sb.length() < 5_000_000) sb.append(unit).append(sb.length());
    String value = sb.toString();
    out("pieces write=" + set(db, KEY, value) + " whole_read=" + get(db, KEY, null));
    long length;
    try (Cursor c = db.rawQuery("SELECT length(value) FROM catalystLocalStorage WHERE key = ?", new String[] {KEY})) {
      c.moveToFirst();
      length = c.getLong(0);
    }
    StringBuilder back = new StringBuilder((int) length);
    int piece = 200_000;
    int queries = 0;
    for (long start = 1; start <= length; start += piece) {
      try (Cursor c = db.rawQuery("SELECT substr(value, ?, ?) FROM catalystLocalStorage WHERE key = ?",
          new String[] {String.valueOf(start), String.valueOf(piece), KEY})) {
        c.moveToFirst();
        back.append(c.getString(0));
        queries++;
      }
    }
    out("pieces length_sql=" + length + " length_java=" + value.length() + " queries=" + queries
        + " identical=" + value.contentEquals(back));
    db.close();
  }
}
