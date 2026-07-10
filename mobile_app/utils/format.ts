// Shared formatting helpers so screens don't each reimplement duration/date logic.

// Audio duration as MM:SS (zero-padded). Used by the player and history cards.
export function formatDuration(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Human-readable ETA ("...", "45s", "2m 5s"). Used by download progress.
export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '...';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

// History timestamp -> locale short date+time, e.g. "Mon, Jan 5, 3:04 PM".
export function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
