import { useEffect, useRef, useState } from 'react';
import { createPersistentStore } from './persistentStore';

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

// hydrate spreads over defaults so settings added in later versions are present
// on records saved by an older build.
const store = createPersistentStore<Settings>(SETTINGS_KEY, { ...DEFAULT_SETTINGS }, {
  hydrate: (parsed) => ({ ...DEFAULT_SETTINGS, ...parsed }),
});

export const loadSettings = () => store.load();
export const saveSettings = (newSettings: Settings) => store.save({ ...newSettings });

export function useSettings() {
  const settings = store.useValue();

  const setSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const current = store.get() ?? (await store.load());
    await store.save({ ...current, [key]: value });
  };

  return { settings, setSetting };
}

// Binding a text input to a Settings key lags on mobile: every keystroke writes
// to AsyncStorage and re-renders subscribers. Keep it local, persist on quiet.
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
