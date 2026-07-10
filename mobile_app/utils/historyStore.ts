import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { loadSettings } from './settingsStore';

const HISTORY_KEY = 'muffin.history.v1';

export interface HistoryItem {
  id: string;
  timestampISO: string;
  sourceFileName: string;
  language: string;
  rawTranscript: string;
  formattedTranscript?: string;
  summary?: string;
  sourceFilePath?: string;
  audioDurationMs?: number;
  embedding?: number[];
  extractedDates?: { quote: string; name: string; type: 'date' | 'time' }[];
}

let cachedHistory: HistoryItem[] | null = null;
let subscribers: ((history: HistoryItem[]) => void)[] = [];

function notifySubscribers() {
  if (cachedHistory) {
    subscribers.forEach((sub) => sub(cachedHistory!));
  }
}

async function pruneHistoryAudio(history: HistoryItem[]) {
  try {
    const settings = await loadSettings();
    if (settings.autoDeleteCacheDuration === 'Never') return;

    const thresholdDays = settings.autoDeleteCacheDuration === '1 Week' ? 7 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let modified = false;

    const nextHistory = [...history];

    for (let i = 0; i < nextHistory.length; i++) {
      const item = nextHistory[i];
      if (item.sourceFilePath) {
        const itemTime = new Date(item.timestampISO).getTime();
        if (now - itemTime > thresholdMs) {
          try {
            await FileSystemLegacy.deleteAsync(item.sourceFilePath, { idempotent: true });
          } catch (e) {}
          nextHistory[i] = { ...item, sourceFilePath: undefined };
          modified = true;
        }
      }
    }

    if (modified) {
      await saveHistory(nextHistory);
    }
  } catch (e) {
    console.error('Failed to prune history audio', e);
  }
}

export async function loadHistory(): Promise<HistoryItem[]> {
  if (cachedHistory) return cachedHistory;
  try {
    const data = await AsyncStorage.getItem(HISTORY_KEY);
    if (data) {
      cachedHistory = JSON.parse(data);
      if (cachedHistory && cachedHistory.length > 0) {
        // Fire and forget so we don't block loading
        pruneHistoryAudio(cachedHistory);
      }
      return cachedHistory || [];
    }
  } catch (e) {
    console.error('Failed to load history', e);
  }
  cachedHistory = [];
  return cachedHistory;
}

async function saveHistory(history: HistoryItem[]) {
  cachedHistory = history;
  notifySubscribers();
  try {
    // AsyncStorage writes are atomic per key — one setItem, no tmp-key/rename dance.
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save history', e);
  }
}

export function useHistory() {
  const [items, setLocalItems] = useState<HistoryItem[]>(cachedHistory || []);

  useEffect(() => {
    let isMounted = true;
    if (!cachedHistory) {
      loadHistory().then((h) => {
        if (isMounted) setLocalItems(h);
      });
    }

    const handler = (h: HistoryItem[]) => {
      if (isMounted) setLocalItems(h);
    };
    subscribers.push(handler);
    return () => {
      isMounted = false;
      subscribers = subscribers.filter((sub) => sub !== handler);
    };
  }, []);

  const addOrUpdate = async (item: HistoryItem) => {
    let current = cachedHistory;
    if (!current) current = await loadHistory();
    const index = current.findIndex((h) => h.id === item.id);
    let next: HistoryItem[];
    if (index >= 0) {
      next = [...current];
      next[index] = item;
    } else {
      next = [item, ...current];
    }
    setLocalItems(next);
    await saveHistory(next);
  };

  const deleteItem = async (id: string) => {
    let current = cachedHistory;
    if (!current) current = await loadHistory();
    const itemToDelete = current.find((h) => h.id === id);
    if (itemToDelete?.sourceFilePath) {
      FileSystemLegacy.deleteAsync(itemToDelete.sourceFilePath, { idempotent: true }).catch(() => {});
    }
    const next = current.filter((h) => h.id !== id);
    setLocalItems(next);
    await saveHistory(next);
  };

  const getById = (id: string): HistoryItem | undefined => {
    return (cachedHistory || []).find((h) => h.id === id);
  };

  return { items, addOrUpdate, deleteItem, getById };
}
