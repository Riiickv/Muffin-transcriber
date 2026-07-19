import { createPersistentStore } from './persistentStore';

// Which coach marks the user has already acted on. A coach mark (the little
// arrow bubble that points at an element and tells you what to do) keeps
// reappearing on app launches until you do the thing, then never again - so all
// we persist is a done-flag per id.
type CoachState = Record<string, boolean>;

const store = createPersistentStore<CoachState>('muffin.coachmarks.v1', {});

/** Mark a coach mark's action as done, so it stops appearing. Fire and forget. */
export async function markCoachDone(id: string): Promise<void> {
  const current = store.get() ?? (await store.load());
  if (current[id]) return;
  await store.save({ ...current, [id]: true });
}

/** Whether the user has already done this coach mark's action. */
export function useCoachDone(id: string): boolean {
  const state = store.useValue();
  return !!state[id];
}
