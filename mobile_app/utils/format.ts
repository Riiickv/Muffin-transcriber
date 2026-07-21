// Shared formatting helpers so screens don't each reimplement duration/date logic.

// Audio duration, zero-padded. MM:SS normally, H:MM:SS past an hour so an
// imported lecture reads "1:30:00" instead of "90:00". Used by the player and
// history cards.
export function formatDuration(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Human-readable ETA ("...", "45s", "2m 5s"). Used by download progress.
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '...';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

// toLocaleDateString with options leans on the phone's Intl engine, and a few
// stripped-down builds throw instead of degrading. Guard it so a date can never
// crash a screen: on failure fall back to a plain, locale-agnostic string.
function localeDate(iso: string, options: Intl.DateTimeFormatOptions, fallback: (d: Date) => string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(undefined, options);
  } catch {
    return fallback(d);
  }
}

// History timestamp -> locale short date+time, e.g. "Mon, Jan 5, 3:04 PM".
export function formatHistoryDate(iso: string): string {
  return localeDate(
    iso,
    { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    (d) => `${d.toDateString()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

// Compact "how long ago", for list subtitles: "now", "5m", "3h", "2d", "Jul 6".
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return '';
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return localeDate(iso, { month: 'short', day: 'numeric' }, (d) => d.toDateString().slice(4, 10));
}
