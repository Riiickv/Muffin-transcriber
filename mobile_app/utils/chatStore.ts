import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ChatMessage } from './ChatEngine';

const CHATS_KEY = 'muffin.chats.v1';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
}

let cachedChats: ChatSession[] | null = null;
let subscribers: ((chats: ChatSession[]) => void)[] = [];

function notifySubscribers() {
  if (cachedChats) {
    subscribers.forEach((sub) => sub(cachedChats!));
  }
}

async function saveChats(chats: ChatSession[]) {
  cachedChats = chats;
  notifySubscribers();
  try {
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch (e) {
    console.error('Failed to save chats', e);
  }
}

// Initial load
AsyncStorage.getItem(CHATS_KEY).then(async (data) => {
  if (data) {
    try {
      cachedChats = JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse chats', e);
      cachedChats = [];
    }
  } else {
    // Migration: try to load old single-chat messages
    try {
      const oldData = await AsyncStorage.getItem('chat_messages');
      if (oldData) {
        const oldMessages = JSON.parse(oldData);
        if (oldMessages && oldMessages.length > 0) {
          cachedChats = [
            {
              id: Date.now().toString(),
              title: 'New Chat',
              messages: oldMessages,
              updatedAt: new Date().toISOString(),
            },
          ];
          await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(cachedChats));
          notifySubscribers();
          return;
        }
      }
    } catch (e) {
      console.error('Migration failed', e);
    }
    cachedChats = [];
  }
  notifySubscribers();
});

export function useChats() {
  const [chats, setChats] = useState<ChatSession[]>(cachedChats || []);

  useEffect(() => {
    setChats(cachedChats || []);
    subscribers.push(setChats);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== setChats);
    };
  }, []);

  return { items: chats };
}

export async function addChatSession(title: string): Promise<string> {
  const newChat: ChatSession = {
    id: Date.now().toString(),
    title,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  const next = [newChat, ...(cachedChats || [])];
  await saveChats(next);
  return newChat.id;
}

export async function updateChatMessages(id: string, messages: ChatMessage[]) {
  const current = cachedChats || [];
  const next = current.map((chat) => {
    if (chat.id === id) {
      return { ...chat, messages, updatedAt: new Date().toISOString() };
    }
    return chat;
  });
  await saveChats(next);
}

export async function renameChatSession(id: string, newTitle: string) {
  const current = cachedChats || [];
  const next = current.map((chat) => {
    if (chat.id === id) {
      return { ...chat, title: newTitle, updatedAt: new Date().toISOString() };
    }
    return chat;
  });
  await saveChats(next);
}

export async function deleteChatSession(id: string) {
  const current = cachedChats || [];
  const next = current.filter((chat) => chat.id !== id);
  await saveChats(next);
}

export async function clearAllChats() {
  cachedChats = [];
  notifySubscribers();
  try {
    await AsyncStorage.removeItem(CHATS_KEY);
    // Also drop the legacy single-chat key so the migration path can't resurrect it.
    await AsyncStorage.removeItem('chat_messages');
  } catch (e) {
    console.error('Failed to clear chats', e);
  }
}
