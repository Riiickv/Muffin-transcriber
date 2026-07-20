import { useSyncExternalStore } from 'react';

/**
 * What the engines are working on right now, app-wide.
 *
 * Module scope on purpose. The History screen guarded its buttons with local
 * `isProcessing` state, which dies with the screen: leave mid-Format and come
 * back and every button is enabled again, so a second job starts on top of the
 * first. The same blind spot let a recording's enrichment collide with a
 * Format started here. A per-screen flag cannot see work owned by another
 * screen, so this doesn't live in one.
 *
 * The label is the human name of the running action, for the "starting this
 * stops that" prompt.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function setAiActivity(label: string | null): void {
  if (current === label) return;
  current = label;
  listeners.forEach((l) => l());
}

export function getAiActivity(): string | null {
  return current;
}

/** Re-renders when the running action changes. */
export function useAiActivity(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getAiActivity,
    getAiActivity
  );
}
