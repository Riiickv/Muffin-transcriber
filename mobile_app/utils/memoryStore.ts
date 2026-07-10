import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const MEMORY_KEY = 'muffin.memory.v1';

export interface MemoryEntry {
  id: string;
  text: string;
}

let cachedMemories: MemoryEntry[] | null = null;
let subscribers: ((memories: MemoryEntry[]) => void)[] = [];

function notifySubscribers() {
  if (cachedMemories) {
    subscribers.forEach((sub) => sub(cachedMemories!));
  }
}

export async function loadMemories(): Promise<MemoryEntry[]> {
  if (cachedMemories) return cachedMemories;
  try {
    const data = await AsyncStorage.getItem(MEMORY_KEY);
    if (data) {
      cachedMemories = JSON.parse(data);
      return cachedMemories || [];
    }
  } catch (e) {
    console.error('Failed to load memories', e);
  }
  cachedMemories = [];
  return cachedMemories;
}

export async function saveMemories(memories: MemoryEntry[]) {
  cachedMemories = memories;
  notifySubscribers();
  try {
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
  } catch (e) {
    console.error('Failed to save memories', e);
  }
}

export function useMemory() {
  const [items, setLocalItems] = useState<MemoryEntry[]>(cachedMemories || []);

  useEffect(() => {
    let isMounted = true;
    if (!cachedMemories) {
      loadMemories().then((m) => {
        if (isMounted) setLocalItems(m);
      });
    }

    const handler = (m: MemoryEntry[]) => {
      if (isMounted) setLocalItems(m);
    };
    subscribers.push(handler);
    return () => {
      isMounted = false;
      subscribers = subscribers.filter((sub) => sub !== handler);
    };
  }, []);

  const addMemory = async (text: string) => {
    let current = cachedMemories;
    if (!current) current = await loadMemories();
    
    const trimmed = text.trim();
    if (!trimmed) return;

    if (current.some(m => m.text.toLowerCase() === trimmed.toLowerCase())) return;

    const newItem: MemoryEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: trimmed,
    };
    
    const next = [newItem, ...current];
    setLocalItems(next);
    await saveMemories(next);
  };

  const updateMemory = async (id: string, text: string) => {
    let current = cachedMemories;
    if (!current) current = await loadMemories();
    
    const trimmed = text.trim();
    if (!trimmed) return;

    const next = current.map(m => m.id === id ? { ...m, text: trimmed } : m);
    setLocalItems(next);
    await saveMemories(next);
  };

  const deleteMemory = async (id: string) => {
    let current = cachedMemories;
    if (!current) current = await loadMemories();
    const next = current.filter((m) => m.id !== id);
    setLocalItems(next);
    await saveMemories(next);
  };

  return { items, addMemory, updateMemory, deleteMemory };
}
