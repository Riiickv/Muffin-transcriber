import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from './ChatEngine';
import { createPersistentStore } from './persistentStore';

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
