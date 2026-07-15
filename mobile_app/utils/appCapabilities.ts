import { Settings } from './settingsStore';
import { LANGUAGE_OPTIONS, FORMAT_LANGUAGE_OPTIONS } from './languages';

// One description of the app that both the assistant prompt and the tool
// executor read from, so "where is X", "turn on X" and the inline chat controls
// all stay in sync with a single edit here.

export type ControlType = 'boolean' | 'enum';

export type SettingSpec = {
  key: string;                 // settings key, or 'themeMode' / 'accentColor'
  store: 'settings' | 'theme';
  label: string;
  location: string;            // where the same control lives in the UI
  description: string;
  type: ControlType;
  options?: string[];          // full option list for enum controls
  valuesHint: string;          // compact hint shown to the model
};

export const SETTINGS_REGISTRY: SettingSpec[] = [
  { key: 'formatByDefault', store: 'settings', label: 'Format by default', location: 'Settings › General', description: 'Clean up punctuation and capitalization automatically after each transcription.', type: 'boolean', valuesHint: 'true or false' },
  { key: 'summarizeByDefault', store: 'settings', label: 'Summarize by default', location: 'Settings › General', description: 'Produce a bullet-point summary automatically after each transcription.', type: 'boolean', valuesHint: 'true or false' },
  { key: 'normalizeAudio', store: 'settings', label: 'Normalize audio', location: 'Settings › General', description: 'Boost quiet audio before transcribing for better accuracy.', type: 'boolean', valuesHint: 'true or false' },
  { key: 'autoCopyTranscript', store: 'settings', label: 'Auto-copy transcript', location: 'Settings › General', description: 'Copy the finished transcript to the clipboard automatically.', type: 'boolean', valuesHint: 'true or false' },
  { key: 'enableContextLearning', store: 'settings', label: 'Context learning', location: 'Settings › General', description: 'Learn names and jargon from your memos to improve future transcriptions.', type: 'boolean', valuesHint: 'true or false' },
  { key: 'defaultLanguage', store: 'settings', label: 'Default language', location: 'Settings › General', description: 'The spoken language to transcribe. Auto-Detect works for any language.', type: 'enum', options: LANGUAGE_OPTIONS.map((o) => o.value), valuesHint: 'a language name (e.g. English, Spanish) or Auto-Detect' },
  { key: 'formatLanguage', store: 'settings', label: 'Output language', location: 'Home / Record screen', description: 'The language the formatted and summarized text is written in.', type: 'enum', options: FORMAT_LANGUAGE_OPTIONS.map((o) => o.value), valuesHint: 'a language name, or "Auto-Detect / Original" to keep the source language' },
  { key: 'autoDeleteCacheDuration', store: 'settings', label: 'Auto-delete audio files', location: 'Settings › General', description: 'How long to keep original audio before deleting it.', type: 'enum', options: ['Never', '1 Week', '1 Month'], valuesHint: 'Never, 1 Week or 1 Month' },
  { key: 'themeMode', store: 'theme', label: 'Theme', location: 'Settings › Appearance', description: 'Light, dark, or pure-black (AMOLED) appearance.', type: 'enum', options: ['system', 'light', 'dark', 'amoled'], valuesHint: 'system, light, dark or amoled' },
  { key: 'accentColor', store: 'theme', label: 'Accent color', location: 'Settings › Appearance', description: 'The app highlight color.', type: 'enum', options: ['system', 'muffin', 'green', 'purple', 'red'], valuesHint: 'system, muffin, green, purple or red' },
];

export function getSettingSpec(key: string): SettingSpec | undefined {
  return SETTINGS_REGISTRY.find((s) => s.key.toLowerCase() === key.toLowerCase());
}

export type ScreenSpec = { id: string; name: string; description: string };

export const SCREENS: ScreenSpec[] = [
  { id: 'index', name: 'Home', description: 'Pick or share an audio/video file and transcribe it.' },
  { id: 'record', name: 'Record', description: 'Record a voice memo and transcribe it.' },
  { id: 'history', name: 'History', description: 'Browse, read and edit past transcriptions.' },
  { id: 'chat', name: 'Chat', description: 'This assistant.' },
  { id: 'settings', name: 'Settings', description: 'All preferences, models, appearance and prompts.' },
  { id: 'memory', name: 'Memory', description: 'The terms and facts the app has learned about you.' },
];

// The value the assistant sees for a setting, reading from the right store.
function currentValue(spec: SettingSpec, settings: Settings, theme: { themeMode: string; accentColor: string }): string {
  if (spec.store === 'theme') {
    return spec.key === 'themeMode' ? theme.themeMode : theme.accentColor;
  }
  return String((settings as any)[spec.key]);
}

// The app map + live state injected into the chat system prompt.
export function buildCapabilitiesBlock(settings: Settings, theme: { themeMode: string; accentColor: string }): string {
  const settingLines = SETTINGS_REGISTRY.map(
    (s) => `- ${s.key} ("${s.label}") = ${currentValue(s, settings, theme)} | ${s.description} | set to: ${s.valuesHint} | found in: ${s.location}`
  ).join('\n');

  const screenLines = SCREENS.map((s) => `- ${s.id} — ${s.name}: ${s.description}`).join('\n');

  return `<app_settings>
These are the app's settings and their current values. To change one, use SET_SETTING with the exact key and a value from "set to". Never invent keys or values.
${settingLines}
</app_settings>

<app_screens>
${screenLines}
</app_screens>`;
}

// The tool contract described to the model.
export const TOOL_INSTRUCTIONS = `<tools>
You can act on the app. To do so, add a <tool_call> block with one JSON object AFTER a short, friendly confirmation sentence. Only use the actions and exact keys listed above.

The user NEVER sees the <tool_call> block - only your sentence. So the sentence must say what you are doing in plain words: "Done, deleting it now." or "Auto-copy is on." Never write tool_call, JSON, ID, key, or action in your sentence - the user does not know what those are and does not need to.

You may emit SEVERAL <tool_call> blocks in one reply — one per action. If the user asks for three transcripts to be deleted, emit three blocks. Never say you cannot do something just because it takes more than one action.

- Change a setting (applies immediately, the user sees a live control in the chat):
  <tool_call>{"action": "SET_SETTING", "key": "formatByDefault", "value": true}</tool_call>
- Show a setting's control without changing it (e.g. when asked where it is):
  <tool_call>{"action": "SHOW_SETTING", "key": "autoCopyTranscript"}</tool_call>
- Go to a screen (use an id from app_screens):
  <tool_call>{"action": "NAVIGATE_TO", "tab": "settings"}</tool_call>
- Delete a transcript. Emit this immediately. The APP shows the confirmation dialog itself, so NEVER ask the user to confirm in text:
  <tool_call>{"action": "DELETE_TRANSCRIPT", "transcript_id": "the-id-from-history_index"}</tool_call>
- Rename a transcript. new_name is REQUIRED and must be a name the USER gave you. If they said "rename the latest transcript" without saying what to call it, you do not know the new name - reply asking what to call it and emit NO tool_call. Never invent a name:
  <tool_call>{"action": "RENAME_TRANSCRIPT", "transcript_id": "the-id-from-history_index", "new_name": "Dentist appointment"}</tool_call>

Rules:
- Only emit a tool_call when the user actually asks you to do or change something.
- One action per block. Several blocks are fine; a JSON array inside one block is not.
- You genuinely HAVE these tools. Never reply that you cannot do something that is listed above — emit the tool_call instead. "I can't perform that action" is always the wrong answer for an action in this list.
- The app asks the user for confirmation itself, with its own dialog. Never ask "would you like me to confirm?" or "shall I go ahead?" — emit the tool_call and let the app ask.
- If the user agrees to something you just offered ("yes", "do it", "delete it"), emit the tool_call for it in your very next reply.
- These are the ONLY actions you have. If the user wants something else, say so plainly - do not emit a different action and hope. SHOW_SETTING in particular is only for showing a setting's control; it cannot rename, delete, or edit anything.
- To answer "where is X", tell them the location from "found in" and use SHOW_SETTING so they can flip it right here.
- Never claim you changed something without emitting the matching tool_call.
</tools>`;
