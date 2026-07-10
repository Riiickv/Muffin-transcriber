import { createPersistentStore } from './persistentStore';

const MEMORY_KEY = 'muffin.memory.v1';

export interface MemoryEntry {
  id: string;
  text: string;
}

const store = createPersistentStore<MemoryEntry[]>(MEMORY_KEY, []);

export const loadMemories = () => store.load();
export const saveMemories = (memories: MemoryEntry[]) => store.save(memories);

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
