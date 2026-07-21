import { useEffect, useRef, useState } from 'react';
import { createPersistentStore } from './persistentStore';
import type { AppLanguage } from '@/utils/i18n';

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
  /**
   * Chat with Muffin is opt-in while it's still beta. Off by default and the
   * Chat tab stays hidden until it's on, so nobody meets a half-finished feature
   * without choosing to.
   */
  enableChatBeta: boolean;
  /** Suppresses the "starting this stops that" warning once the user ticks it. */
  hideAiBusyWarning: boolean;
  /** Type transcription out progressively instead of showing it at once. */
  enableTypewriter: boolean;
  typewriterSpeed: 'slow' | 'balanced' | 'fast';
  /** UI language. 'auto' follows the phone. See utils/i18n.ts. */
  appLanguage: AppLanguage;
  /** One-time tester feedback popup. False until dismissed; a new key, so
   *  existing testers see it once after updating (hydrate fills the default). */
  seenTesterWelcome: boolean;
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
  enableChatBeta: false,
  hideAiBusyWarning: false,
  // On by default: the user asked for it always active.
  enableTypewriter: true,
  typewriterSpeed: 'balanced',
  // 'auto' so an Italian phone opens in Italian without anyone hunting for
  // a setting. Existing installs hydrate over these defaults, so they get
  // 'auto' too rather than being pinned to English.
  appLanguage: 'auto',
  seenTesterWelcome: false,
};

// Model ids that changed in the catalog (e.g. quant swaps) - remap stale
// preferences so the picker doesn't show a ghost entry.
const MODEL_RENAMES: Record<string, string> = {
  'ggml-large-v3-turbo-q5_0.bin': 'ggml-large-v3-turbo-q8_0.bin',
  // The English-only Base model is gone. Anyone who had it selected gets moved
  // to Balanced (Small) - multilingual, the closest thing to what they had.
  'ggml-base.en.bin': 'ggml-small.bin',
};

// hydrate spreads over defaults so settings added in later versions are present
// on records saved by an older build.
const store = createPersistentStore<Settings>(SETTINGS_KEY, { ...DEFAULT_SETTINGS }, {
  hydrate: (parsed) => {
    const s = { ...DEFAULT_SETTINGS, ...parsed };
    if (MODEL_RENAMES[s.preferredWhisperModel]) {
      s.preferredWhisperModel = MODEL_RENAMES[s.preferredWhisperModel];
    }
    return s;
  },
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
