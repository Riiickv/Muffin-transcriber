import { useSyncExternalStore } from 'react';

/**
 * "Does the user have any models?" — readable from outside a screen.
 *
 * The welcome takeover is decided by the Transcribe screen, but the header and
 * the tab bar have to disappear with it, and they live OUTSIDE that screen: the
 * header belongs to the navigator, the tab bar is the navigator's own chrome.
 * Neither can use useFocusEffect the way a screen does, so the answer lives here
 * and useModelOptions publishes it after it reads the disk.
 *
 * null means "not checked yet" — deliberately distinct from false. Treating
 * unchecked as "no models" would blink the bars off on every launch.
 */
let present: boolean | null = null;
const listeners = new Set<() => void>();

export function setModelsPresent(value: boolean): void {
  if (present === value) return;
  present = value;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** true / false / null (not yet known). */
export function useModelsPresent(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => present,
    () => present
  );
}

/** The welcome takeover is showing, so the app chrome should be out of the way. */
export function useIsFirstRun(): boolean {
  return useModelsPresent() === false;
}
