import { LANGUAGE_VALUES, FORMAT_LANGUAGE_VALUES } from './languages';

// The settings the chat can show and change. One list, read by the command
// step (what the model is offered), by the executor in the chat screen, and by
// the control drawn in the chat, so the three cannot drift apart.

export type ControlType = 'boolean' | 'enum';

export type SettingSpec = {
  key: string;                 // settings key, or 'themeMode' / 'accentColor'
  store: 'settings' | 'theme';
  /** English name, for the private notes the app keeps about what it did. */
  label: string;
  /** Translation key of the name the Settings screen shows for it. */
  labelKey: string;
  /** Translation keys of the place it lives, outermost first. */
  where: string[];
  /** One line for the model, in plain words. Never shown to the user. */
  about: string;
  type: ControlType;
  options?: string[];          // full option list for enum controls
};

export const SETTINGS_REGISTRY: SettingSpec[] = [
  { key: 'formatByDefault', store: 'settings', label: 'Improve by default', labelKey: 'settings.formatByDefault', where: ['tabs.settings', 'settings.formatSummarize'], about: 'Improve the text automatically after every transcription', type: 'boolean' },
  { key: 'summarizeByDefault', store: 'settings', label: 'Summarize by default', labelKey: 'settings.summarizeByDefault', where: ['tabs.settings', 'settings.formatSummarize'], about: 'Summarize automatically after every transcription', type: 'boolean' },
  { key: 'normalizeAudio', store: 'settings', label: 'Normalize audio', labelKey: 'settings.normalizeAudio', where: ['tabs.settings', 'settings.transcription'], about: 'Boost the volume of quiet recordings', type: 'boolean' },
  { key: 'autoCopyTranscript', store: 'settings', label: 'Auto-copy transcript', labelKey: 'settings.autoCopy', where: ['tabs.settings', 'settings.transcription'], about: 'Auto copy: copy the finished transcript to the clipboard', type: 'boolean' },
  { key: 'enableContextLearning', store: 'settings', label: 'Memory', labelKey: 'settings.contextLearning', where: ['tabs.settings', 'settings.memoryContext'], about: 'Memory: learn names and terms from the recordings', type: 'boolean' },
  { key: 'defaultLanguage', store: 'settings', label: 'Default language', labelKey: 'settings.defaultLanguage', where: ['tabs.settings', 'settings.transcription'], about: 'Transcription language: the language spoken in the recordings', type: 'enum', options: LANGUAGE_VALUES },
  { key: 'formatLanguage', store: 'settings', label: 'Improvement language', labelKey: 'settings.formatLanguage', where: ['tabs.transcribe'], about: 'Language that Improve and Summarize write in', type: 'enum', options: FORMAT_LANGUAGE_VALUES },
  { key: 'autoDeleteCacheDuration', store: 'settings', label: 'Auto-delete audio files', labelKey: 'settings.autoDeleteLabel', where: ['tabs.settings', 'settings.storageHeader'], about: 'How long the audio files are kept before they are deleted', type: 'enum', options: ['Never', '1 Week', '1 Month'] },
  { key: 'themeMode', store: 'theme', label: 'Theme', labelKey: 'settings.themeMode', where: ['tabs.settings', 'settings.appearance'], about: 'Theme: light or dark appearance', type: 'enum', options: ['system', 'light', 'dark', 'amoled'] },
  { key: 'accentColor', store: 'theme', label: 'Accent color', labelKey: 'settings.accentColor', where: ['tabs.settings', 'settings.appearance'], about: 'Accent color of the app', type: 'enum', options: ['system', 'muffin', 'green', 'purple', 'red'] },
];

export function getSettingSpec(key: string): SettingSpec | undefined {
  return SETTINGS_REGISTRY.find((s) => s.key.toLowerCase() === key.toLowerCase());
}
