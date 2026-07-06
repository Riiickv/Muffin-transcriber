import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

const SETTINGS_KEY = 'muffin.settings.v1';

export interface Settings {
  defaultLanguage: string;
  preferredWhisperModel: string;
  preferredFormatterModel: string;
  formatByDefault: boolean;
  summarizeByDefault: boolean;
  formatLanguage: string;
  normalizeAudio: boolean;
  autoCopyTranscript: boolean;
  autoDeleteCacheDuration: 'Never' | '1 Week' | '1 Month';
  customFormatSystemPrompt: string;
  customSummarySystemPrompt: string;
  enableContextLearning: boolean;
  preferredChatModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultLanguage: 'Auto-Detect',
  preferredWhisperModel: '',
  preferredFormatterModel: '',
  formatByDefault: false,
  summarizeByDefault: false,
  formatLanguage: 'Auto-Detect / Original',
  normalizeAudio: true,
  autoCopyTranscript: false,
  autoDeleteCacheDuration: 'Never',
  customFormatSystemPrompt: '',
  customSummarySystemPrompt: '',
  enableContextLearning: false,
  preferredChatModel: '',
};

let cachedSettings: Settings | null = null;
let subscribers: ((settings: Settings) => void)[] = [];
let inFlightLoad: Promise<Settings> | null = null;

function notifySubscribers() {
  if (cachedSettings) {
    subscribers.forEach((sub) => sub(cachedSettings!));
  }
}

export async function loadSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  if (inFlightLoad) return inFlightLoad;

  inFlightLoad = (async () => {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (data) {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
        cachedSettings = parsed;
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
    const newSettings = { ...DEFAULT_SETTINGS };
    cachedSettings = newSettings;
    return newSettings;
  })();

  try {
    return await inFlightLoad;
  } finally {
    inFlightLoad = null;
  }
}

export async function saveSettings(newSettings: Settings) {
  cachedSettings = { ...newSettings };
  notifySubscribers();
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(cachedSettings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

export function useSettings() {
  const [settings, setLocalSettings] = useState<Settings>(cachedSettings || DEFAULT_SETTINGS);

  useEffect(() => {
    let isMounted = true;
    if (!cachedSettings) {
      loadSettings().then((s) => {
        if (isMounted) setLocalSettings(s);
      });
    }

    const handler = (s: Settings) => {
      if (isMounted) setLocalSettings(s);
    };
    subscribers.push(handler);
    return () => {
      isMounted = false;
      subscribers = subscribers.filter((sub) => sub !== handler);
    };
  }, []);

  const setSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    let current = cachedSettings;
    if (!current) current = await loadSettings();
    const updated = { ...current, [key]: value };
    setLocalSettings(updated);
    await saveSettings(updated);
  };

  const resetSettings = async () => {
    setLocalSettings({ ...DEFAULT_SETTINGS });
    await saveSettings({ ...DEFAULT_SETTINGS });
  };

  return { settings, setSetting, resetSettings };
}

/**
 * Text inputs bound directly to a Settings key cause typing lag on mobile —
 * every keystroke triggers an AsyncStorage write and a subscriber re-render.
 * This hook keeps the value local while typing and only persists after
 * `debounceMs` of quiet.
 */
export function useDebouncedSetting<K extends keyof Settings>(key: K, debounceMs = 400) {
  const { settings, setSetting } = useSettings();
  const [localValue, setLocalValue] = useState<Settings[K]>(settings[key]);
  const lastSyncedRef = useRef<Settings[K]>(settings[key]);

  // Pull in updates from other screens (Settings while Home is open, etc.),
  // but only when they weren't just triggered by our own debounced write.
  useEffect(() => {
    if (settings[key] !== lastSyncedRef.current) {
      setLocalValue(settings[key]);
      lastSyncedRef.current = settings[key];
    }
  }, [settings, key]);

  // Debounced save.
  useEffect(() => {
    if (localValue === lastSyncedRef.current) return;
    const timer = setTimeout(() => {
      lastSyncedRef.current = localValue;
      setSetting(key, localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, key, setSetting, debounceMs]);

  return [localValue, setLocalValue] as const;
}
