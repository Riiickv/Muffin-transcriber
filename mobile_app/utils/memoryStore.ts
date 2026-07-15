import { createPersistentStore } from './persistentStore';

const MEMORY_KEY = 'muffin.memory.v1';
const SUGGESTED_KEY = 'muffin.memory.suggested.v1';

export interface MemoryEntry {
  id: string;
  text: string;
}

const store = createPersistentStore<MemoryEntry[]>(MEMORY_KEY, []);

/**
 * Things the model THINKS it learned about the user, waiting to be approved.
 *
 * Kept apart from real memories on purpose. A memory is free text the model
 * invents, saved to the user's data, and then fed into every future
 * transcription and chat prompt - so a wrong one is invisible AND it compounds.
 * That is exactly how this app once decided a user "works in marketing": the
 * extractor handed back its own prompt examples and they were saved as facts.
 *
 * The model is good at spotting a candidate and bad at knowing if it's true.
 * So it proposes, the user approves, and nothing here is ever read by a prompt.
 */
const suggestedStore = createPersistentStore<MemoryEntry[]>(SUGGESTED_KEY, []);

export const loadMemories = () => store.load();
export const saveMemories = (memories: MemoryEntry[]) => store.save(memories);

export const loadSuggestedMemories = () => suggestedStore.load();

/** Queue candidates for review. Skips anything already known or already queued. */
export async function suggestMemories(texts: string[]): Promise<void> {
  const live = store.get() ?? (await store.load());
  const queued = suggestedStore.get() ?? (await suggestedStore.load());
  const seen = (t: string) =>
    live.some((m) => m.text.toLowerCase() === t.toLowerCase()) ||
    queued.some((m) => m.text.toLowerCase() === t.toLowerCase());

  const fresh = texts
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !seen(t))
    .map((text) => ({
      id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
    }));
  if (fresh.length === 0) return;
  // Cap the queue: an unbounded backlog of guesses is a chore, not a feature.
  await suggestedStore.save([...fresh, ...queued].slice(0, 20));
}

export function useSuggestedMemories() {
  const items = suggestedStore.useValue();

  const dismiss = async (id: string) => {
    const current = suggestedStore.get() ?? (await suggestedStore.load());
    await suggestedStore.save(current.filter((m) => m.id !== id));
  };

  const dismissAll = async () => suggestedStore.save([]);

  /** Approve one: it becomes a real memory and leaves the queue. */
  const accept = async (id: string) => {
    const current = suggestedStore.get() ?? (await suggestedStore.load());
    const item = current.find((m) => m.id === id);
    if (!item) return;
    const live = store.get() ?? (await store.load());
    if (!live.some((m) => m.text.toLowerCase() === item.text.toLowerCase())) {
      await store.save([{ id: `mem-${Date.now()}`, text: item.text }, ...live]);
    }
    await suggestedStore.save(current.filter((m) => m.id !== id));
  };

  return { items, accept, dismiss, dismissAll };
}

export function useMemory() {
  const items = store.useValue();

  const addMemory = async (text: string) => {
    const current = store.get() ?? (await store.load());
    const trimmed = text.trim();
    if (!trimmed) return;
    if (current.some((m) => m.text.toLowerCase() === trimmed.toLowerCase())) return;

    const newItem: MemoryEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: trimmed,
    };
    await store.save([newItem, ...current]);
  };

  const updateMemory = async (id: string, text: string) => {
    const current = store.get() ?? (await store.load());
    const trimmed = text.trim();
    if (!trimmed) return;
    await store.save(current.map((m) => (m.id === id ? { ...m, text: trimmed } : m)));
  };

  const deleteMemory = async (id: string) => {
    const current = store.get() ?? (await store.load());
    await store.save(current.filter((m) => m.id !== id));
  };

  return { items, addMemory, updateMemory, deleteMemory };
}
