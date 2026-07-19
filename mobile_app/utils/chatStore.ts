import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from './ChatEngine';
import { createPersistentStore } from './persistentStore';
import { t } from '@/utils/i18n';

const CHATS_KEY = 'muffin.chats.v1';
const LEGACY_KEY = 'chat_messages';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
}

const store = createPersistentStore<ChatSession[]>(CHATS_KEY, []);

// One-time migration from the old single-chat key, kicked off at module load.
// Gated on the ABSENCE of the main key in storage (not on the array being
// empty): a user who deleted every chat has "[]" stored, and re-running the
// migration then would resurrect their deleted legacy chats.
(async () => {
  try {
    const existing = await AsyncStorage.getItem(CHATS_KEY);
    if (existing != null) return;
    const oldData = await AsyncStorage.getItem(LEGACY_KEY);
    if (oldData) {
      const oldMessages = JSON.parse(oldData);
      if (oldMessages && oldMessages.length > 0) {
        await store.save([
          {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: oldMessages,
            updatedAt: new Date().toISOString(),
          },
        ]);
      }
      // Drop the legacy key so this can never re-run.
      await AsyncStorage.removeItem(LEGACY_KEY);
    }
  } catch (e) {
    console.error('Chat migration failed', e);
  }
})();

export function useChats() {
  const items = store.useValue();
  return { items };
}

/**
 * A chat's name, taken from the first thing the user said.
 *
 * Deliberately NOT model-generated. generateTitle() already exists and would
 * write a prettier label, but it runs on LLMEngine's context while the chat
 * model lives on ChatEngine's - the two hold SEPARATE llama contexts, so
 * titling a chat through it would load a second copy of a 0.8-2.3 GB model into
 * RAM right after a chat inference, or unload/reload one on every new chat.
 * Neither is worth paying for a label, and the user's own first sentence is
 * what they'd have named it anyway.
 */
export function titleFromMessage(message: string): string {
  const MAX = 40;
  const fallback = t('chat.newChat') || 'New Chat';
  // Collapse newlines/runs of spaces so a pasted paragraph can't wreck the
  // drawer layout, and drop trailing punctuation ("Can you delete this?" reads
  // better as a title without the question mark).
  const clean = message.replace(/\s+/g, ' ').trim().replace(/[?!.,;:]+$/, '').trim();
  if (!clean) return fallback;
  if (clean.length <= MAX) return clean;

  // Cut on a word boundary - a title ending mid-word looks like a bug. If the
  // first word is itself longer than the limit there's no boundary to find, so
  // fall back to a hard cut.
  const cut = clean.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > MAX * 0.5 ? cut.slice(0, lastSpace) : cut;
  return trimmed.trim() + '…';
}

export async function addChatSession(title: string): Promise<string> {
  const current = store.get() ?? (await store.load());
  const newChat: ChatSession = {
    id: Date.now().toString(),
    title,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  await store.save([newChat, ...current]);
  return newChat.id;
}

export async function updateChatMessages(id: string, messages: ChatMessage[]) {
  const current = store.get() ?? (await store.load());
  await store.save(
    current.map((chat) =>
      chat.id === id ? { ...chat, messages, updatedAt: new Date().toISOString() } : chat
    )
  );
}

export async function renameChatSession(id: string, newTitle: string) {
  const current = store.get() ?? (await store.load());
  await store.save(
    current.map((chat) =>
      chat.id === id ? { ...chat, title: newTitle, updatedAt: new Date().toISOString() } : chat
    )
  );
}

/**
 * Record what actually happened when a tool ran, as a system turn in the chat.
 *
 * Without this the assistant fires actions into the void: it emits a tool_call,
 * the app executes it, and the model is never told the outcome. Ask it "did you
 * delete it?" a turn later and it has no record, so it guesses. Deciding and
 * acting aren't enough - it has to be able to OBSERVE.
 *
 * Written straight to the store rather than through the screen's state because
 * a delete lands whenever the user taps the confirmation dialog, which may be
 * long after the reply finished rendering.
 *
 * These turns are fed to the model but hidden from the chat UI: the user already
 * watched the dialog and the transcript disappear, so showing them a second time
 * is noise.
 */
export async function appendActionNote(id: string, note: string): Promise<void> {
  const current = store.get() ?? (await store.load());
  const chat = current.find((c) => c.id === id);
  if (!chat) return;
  const messages = [
    ...(chat.messages ?? []),
    {
      role: 'system' as const,
      content: `[action result] ${note}`,
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
  ];
  await store.save(
    current.map((c) => (c.id === id ? { ...c, messages, updatedAt: new Date().toISOString() } : c))
  );
}

export async function deleteChatSession(id: string) {
  const current = store.get() ?? (await store.load());
  await store.save(current.filter((chat) => chat.id !== id));
}

export async function clearAllChats() {
  await store.save([]);
  try {
    // Also drop the legacy single-chat key so the migration can't resurrect it.
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.error('Failed to clear legacy chats', e);
  }
}
