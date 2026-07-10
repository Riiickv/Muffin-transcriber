import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TextInput, FlatList, Platform, Animated } from 'react-native';
import { Stack, router } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SPACING, RADIUS } from '@/constants/tokens';
import { useSettings } from '@/utils/settingsStore';
import { ModelManager } from '@/utils/ModelManager';
import { chatStream, ChatMessage } from '@/utils/ChatEngine';
import { extractMemories, parseModelJson } from '@/utils/LLMEngine';
import { haptics } from '@/utils/haptics';
import { useHistory, HistoryItem } from '@/utils/historyStore';
import { useChats, addChatSession, updateChatMessages } from '@/utils/chatStore';
import { ChatDrawer } from '@/components/ChatDrawer';
import { InlineSettingControl } from '@/components/InlineSettingControl';
import { getSettingSpec } from '@/utils/appCapabilities';
import * as IntentLauncher from 'expo-intent-launcher';
import { useDialog } from '@/components/Dialog';
import { t } from '@/utils/i18n';

// Approximate stacked-header + status-bar height, used to lift the input above
// the keyboard. Expo Router bundles its own navigation, so @react-navigation/
// elements' useHeaderHeight isn't importable here — approximate per platform.
const HEADER_OFFSET = Platform.OS === 'android' ? 130 : 90;

// Stable per-message key so the FlatList can memoize rows instead of re-keying
// by index (which re-renders every bubble on each streamed token).
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Parses <tool_call>…</tool_call> tags (plus a bare {"action":…} JSON fallback)
// out of an LLM reply. Returns the parsed actions and the text with the tags
// stripped, so execution (handleSend) and rendering (MessageBubble) share one
// grammar instead of maintaining two copies that can drift.
function parseToolCalls(text: string): { actions: any[]; cleanText: string } {
  const actions: any[] = [];
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let cleanText = text
    .replace(toolCallRegex, (_match, json) => {
      const parsed = parseModelJson(json);
      if (parsed) actions.push(parsed);
      return '';
    })
    .trim();

  if (actions.length === 0) {
    const fallback = cleanText.match(/\{[\s\S]*"action"[\s\S]*\}/i);
    if (fallback) {
      const parsed = parseModelJson(fallback[0]);
      if (parsed) {
        actions.push(parsed);
        cleanText = cleanText.replace(fallback[0], '').trim();
      }
    }
  }

  return { actions, cleanText };
}

export default function ChatScreen() {
  const { theme, themeMode, accentColor, setThemeMode, setAccentColor } = useTheme();
  const { settings, setSetting } = useSettings();
  const { items: chatSessions } = useChats();
  
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { items: historyItems, deleteItem } = useHistory();
  const dialog = useDialog();

  const [activeEntity, setActiveEntity] = useState<any>(null);
  const [actionName, setActionName] = useState('');

  useEffect(() => {
    if (!activeChatId && chatSessions.length > 0) {
      setActiveChatId(chatSessions[0].id);
    }
  }, [chatSessions, activeChatId]);

  useEffect(() => {
    if (activeChatId) {
      const active = chatSessions.find(c => c.id === activeChatId);
      if (active && !isGenerating) {
        setMessages(active.messages || []);
      }
    } else {
      if (!isGenerating) setMessages([]);
    }
  }, [activeChatId, chatSessions, isGenerating]);

  const activeModel = settings.preferredChatModel || settings.preferredFormatterModel;

  const handleSend = async () => {
    if (!input.trim() || !activeModel || isGenerating) return;

    let targetChatId = activeChatId;
    if (!targetChatId) {
      targetChatId = await addChatSession(t('chat.newChat') || 'New Chat');
      setActiveChatId(targetChatId);
    }

    const userMsg: ChatMessage = { role: 'user', content: input.trim(), id: genId() };
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInput('');
    setIsGenerating(true);
    haptics.tap();

    await updateChatMessages(targetChatId, newMessages);

    setMessages((prev) => [...prev, { role: 'assistant', content: '', id: genId() }]);

    try {
      const modelPath = ModelManager.getModelPath(activeModel);
      
      let finalMessages = [...newMessages];
      const fullResponse = await chatStream(newMessages, modelPath, activeModel, (token) => {
        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          const updated = [...prev];
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + token
          };
          finalMessages = updated;
          return updated;
        });
      }, { themeMode, accentColor });

      await updateChatMessages(targetChatId, finalMessages);

      if (settings.enableContextLearning) {
        extractMemories(userMsg.content, modelPath, activeModel).catch(console.warn);
      }

      const botResponse = finalMessages[finalMessages.length - 1].content;
      const executeTool = async (toolCall: any) => {
         if (!toolCall || !toolCall.action) return;
         const action = String(toolCall.action).toUpperCase();

         if (action === 'DELETE_TRANSCRIPT') {
            const itemsList = historyItems || [];
            let target = toolCall.transcript_id ? itemsList.find(h => h.id === toolCall.transcript_id) : undefined;
            if (!target && toolCall.transcript_name) {
               const search = String(toolCall.transcript_name).toLowerCase();
               target = itemsList.find(h => {
                  const name = h.sourceFileName.replace(/\.[^/.]+$/, "").toLowerCase();
                  return name === search || name.includes(search) || search.includes(name);
               });
            }
            if (target) {
               const label = target.sourceFileName.replace(/\.[^/.]+$/, "");
               dialog.show({
                  title: t('chat.deleteTitle') || 'Delete transcript?',
                  message: (t('chat.deleteMessage') || "Delete “{name}”? This can't be undone.").replace('{name}', label),
                  icon: 'delete',
                  iconTone: 'danger',
                  buttons: [
                     { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary' },
                     { label: t('chat.delete') || 'Delete', variant: 'danger', onPress: () => { deleteItem(target!.id); } },
                  ],
               });
            }
         } else if (action === 'NAVIGATE_TO' && toolCall.tab) {
            let tab = String(toolCall.tab).toLowerCase();
            if (tab === 'home') tab = 'index';
            if (tab === 'preferences') tab = 'settings';
            router.push((tab === 'memory' ? '/memory' : `/(tabs)/${tab}`) as any);
         } else if (action === 'SET_SETTING' && toolCall.key !== undefined) {
            const spec = getSettingSpec(String(toolCall.key));
            if (spec) {
               let val: any = toolCall.value;
               if (spec.type === 'boolean') {
                  val = val === true || val === 'true' || val === 'on' || val === 1 || val === 'yes';
               } else {
                  val = String(val);
                  const match = (spec.options || []).find(o => o.toLowerCase() === val.toLowerCase());
                  if (match) val = match;
               }
               if (spec.store === 'theme') {
                  if (spec.key === 'themeMode') setThemeMode(val);
                  else setAccentColor(val);
               } else {
                  setSetting(spec.key as any, val);
               }
            }
         }
      };

      const { actions } = parseToolCalls(botResponse);
      for (const toolCall of actions) {
        try {
          await executeTool(toolCall);
        } catch (e) {
          console.error("Tool execution failed", e);
        }
      }

      haptics.success();
    } catch (e) {
      console.error(e);
      const errorMsgs: ChatMessage[] = [
        ...newMessages,
        { role: 'assistant', content: t('chat.errorMessage') || "Sorry, I encountered an error. Make sure your chat model is downloaded and selected in Settings." }
      ];
      setMessages(errorMsgs);
      await updateChatMessages(targetChatId, errorMsgs);
      haptics.error();
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Built once per history change instead of per streamed token; passed to the
  // memoized MessageBubble so only the streaming row re-renders.
  const searchTerms = useMemo(() => buildSearchTerms(historyItems || []), [historyItems]);
  const hasHistory = !!(historyItems && historyItems.length > 0);
  const onOpenTranscript = useCallback((transcriptId: string) => {
    router.push(`/history/${transcriptId}` as any);
  }, []);
  const onEntityPress = useCallback((entity: any) => {
    setActiveEntity(entity);
    setActionName('');
  }, []);

  const submitAction = async () => {
    if (!activeEntity) return;
    const finalName = actionName.trim() || activeEntity.name;
    
    try {
      if (activeEntity.type === 'date') {
        await IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
          data: 'content://com.android.calendar/events',
          extra: {
            title: finalName,
            description: `Quote: "${activeEntity.quote}"`,
          }
        });
      } else {
        await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
          extra: {
            'android.intent.extra.alarm.MESSAGE': finalName,
            'android.intent.extra.alarm.SKIP_UI': false,
          }
        });
      }
    } catch (e) {
      console.error(e);
      dialog.show({ title: t('dialog.actionFailed.title') || 'Action failed', message: t('dialog.actionFailed.message') || 'Could not open the native app.', icon: 'warning', iconTone: 'danger' });
    }
    setActiveEntity(null);
  };

  return (
    <>
      <KeyboardScreen offset={HEADER_OFFSET}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <Stack.Screen 
            options={{ 
              headerTitleAlign: 'left',
              headerTitle: () => (
                <AnimatedPressable style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setIsDrawerOpen(true)}>
                  <Text style={{ fontFamily: 'Nunito-Bold', fontSize: 18, color: theme.text }}>Chat</Text>
                  <Icon name="arrow-forward" size={20} color={theme.text} style={{ marginLeft: SPACING.xs }} />
                </AnimatedPressable>
              ),
              headerRight: () => (
                <AnimatedPressable 
                  onPress={async () => {
                    const id = await addChatSession(t('chat.newChat') || 'New Chat');
                    setActiveChatId(id);
                    setMessages([]);
                    setIsDrawerOpen(false);
                  }}
                  style={{ marginRight: SPACING.md, padding: SPACING.xs }}
                >
                  <Icon name="add" size={24} color={theme.text} />
                </AnimatedPressable>
              )
            }} 
          />

        {!activeModel ? (
          <View style={styles.centerContainer}>
            <Icon name="warning" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textMuted, marginTop: SPACING.md }]}>{t('chat.noModelSelected') || 'No Chat Model Selected'}</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSubtle }]}>
              {t('chat.noModelSubtitle') || 'Please go to Settings and select a Chat Model to use the assistant.'}
            </Text>
            <Button variant="primary" style={{ marginTop: SPACING.lg }} onPress={() => router.push('/settings')}>
              {t('chat.goToSettings') || 'Go to Settings'}
            </Button>
          </View>
        ) : (
          <>
            <FlatList 
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, idx) => item.id ?? idx.toString()}
              contentContainerStyle={styles.chatContainer}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={() => (
                <View style={[styles.emptyState, { marginTop: SPACING.xxl * 2 }]}>
                  <Text style={[styles.emptySubtitle, { color: theme.textMuted, opacity: 0.7 }]}>
                    {t('chat.emptyState') || 'You can ask me anything about your transcripts, just tell me what you need!'}
                  </Text>
                </View>
              )}
              renderItem={({ item, index }) => (
                <MessageBubble
                  message={item}
                  isStreamingRow={isGenerating && index === messages.length - 1 && item.role === 'assistant'}
                  hasHistory={hasHistory}
                  theme={theme}
                  searchTerms={searchTerms}
                  onOpenTranscript={onOpenTranscript}
                  onEntityPress={onEntityPress}
                />
              )}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            <View style={[styles.inputRow, { borderTopColor: theme.divider, backgroundColor: theme.surface }]}>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                value={input}
                onChangeText={setInput}
                placeholder={t('chat.inputPlaceholder') || 'Ask about your transcripts...'}
                placeholderTextColor={theme.textSubtle}
                multiline
                maxLength={500}
              />
              <AnimatedPressable
                style={[
                  styles.sendButton,
                  { backgroundColor: input.trim() && !isGenerating ? theme.tint : theme.divider },
                ]}
                onPress={handleSend}
                disabled={!input.trim() || isGenerating}
                accessibilityLabel="Send"
              >
                <Icon name={isGenerating ? 'more-horiz' : 'arrow-upward'} size={20} color="#fff" filled />
              </AnimatedPressable>
            </View>
          </>
        )}
        </View>
      </KeyboardScreen>
      <ChatDrawer 
        isVisible={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        chats={chatSessions} 
        activeChatId={activeChatId} 
        onSelectChat={(id) => {
          setActiveChatId(id);
          setIsDrawerOpen(false);
        }} 
      />

      {activeEntity && (
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
            <Text style={styles.dialogTitle}>
              {t('chat.addTo') || 'Add to'} {activeEntity.type === 'date' ? (t('chat.calendar') || 'Calendar') : (t('chat.alarms') || 'Alarms')}
            </Text>
            <Text style={[styles.dialogQuote, { color: theme.textMuted }]}>
              "{activeEntity.quote}"
            </Text>
            
            <Text style={styles.label}>{t('chat.eventName') || 'Event Name'}</Text>
            <TextInput
              style={[styles.dialogInput, { color: theme.text, borderColor: theme.divider }]}
              value={actionName}
              onChangeText={setActionName}
              placeholder={activeEntity.name}
              placeholderTextColor={theme.textSubtle}
            />
            
            <View style={styles.dialogActions}>
              <Button variant="ghost" size="sm" onPress={() => setActiveEntity(null)}>{t('dialog.confirmDelete.cancel') || 'Cancel'}</Button>
              <View style={{ width: SPACING.md }} />
              <Button variant="primary" size="sm" onPress={submitAction}>{t('chat.openNativeApp') || 'Open Native App'}</Button>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  chatContainer: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  emptyState: {
    padding: SPACING.xl,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  bubble: {
    maxWidth: '85%',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  inlineLink: {
    fontWeight: 'bold',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    paddingHorizontal: 4,
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.md,
    borderTopWidth: 1,
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  dialog: {
    width: '85%',
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  dialogTitle: {
    fontSize: 20,
    fontFamily: 'Nunito-Bold',
    marginBottom: SPACING.xs,
  },
  dialogQuote: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  dialogInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: 16,
    marginBottom: SPACING.lg,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});

interface SearchTerm {
  text: string;
  type: 'transcript' | 'entity';
  data: any;
}

// Flattens history into linkable transcript names + date/time entities, longest
// first so a phrase matches before its substrings.
function buildSearchTerms(historyItems: HistoryItem[]): SearchTerm[] {
  const terms: SearchTerm[] = [];
  historyItems.forEach((h) => {
    if (h.extractedDates) {
      h.extractedDates.forEach((entity) => {
        if (entity.quote && entity.quote.length > 2) {
          terms.push({ text: entity.quote, type: 'entity', data: entity });
        }
      });
    }
    const name = h.sourceFileName.replace(/\.[^/.]+$/, '');
    if (name.trim().length > 0) {
      terms.push({ text: name, type: 'transcript', data: h.id });
    }
  });
  terms.sort((a, b) => b.text.length - a.text.length);
  return terms;
}

function renderToolAction(act: any, i: number, theme: any) {
  const a = String(act.action || '').toUpperCase();
  if ((a === 'SET_SETTING' || a === 'SHOW_SETTING') && act.key && getSettingSpec(String(act.key))) {
    return <InlineSettingControl key={`set-${i}`} settingKey={String(act.key)} />;
  }
  return (
    <View key={`act-${i}`} style={{ marginTop: 8, padding: 8, backgroundColor: theme.tint + '20', borderRadius: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' }}>
      <Icon name="check-circle" size={16} color={theme.tint} />
      <Text style={{ color: theme.tint, marginLeft: 6, fontSize: 12, fontWeight: 'bold' }}>{t('chat.actionExecuted') || 'Done'}: {act.action}</Text>
    </View>
  );
}

function renderHighlighted(
  cleanContent: string,
  searchTerms: SearchTerm[],
  isUser: boolean,
  theme: any,
  onOpenTranscript: (id: string) => void,
  onEntityPress: (entity: any) => void
) {
  let parts: { text: string; matched?: boolean; type?: string; data?: any }[] = [{ text: cleanContent }];

  searchTerms.forEach((term) => {
    const newParts: typeof parts = [];
    parts.forEach((part) => {
      if (!part.matched && part.text) {
        const splitRegex = new RegExp(`(${term.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const chunks = part.text.split(splitRegex);
        chunks.forEach((chunk) => {
          if (chunk.toLowerCase() === term.text.toLowerCase()) {
            newParts.push({ text: chunk, matched: true, type: term.type, data: term.data });
          } else if (chunk) {
            newParts.push({ text: chunk });
          }
        });
      } else {
        newParts.push(part);
      }
    });
    parts = newParts;
  });

  return (
    <Text style={{ color: isUser ? '#fff' : theme.text, lineHeight: 24 }}>
      {parts.map((part, idx) => {
        if (!part.matched) return <Text key={`text-${idx}`}>{part.text}</Text>;
        if (part.type === 'transcript') {
          return (
            <Text
              key={`link-${idx}`}
              onPress={() => onOpenTranscript(part.data)}
              style={[styles.inlineLink, { color: theme.tint, borderColor: theme.tint, backgroundColor: theme.surface }]}
            >
              {part.text}
            </Text>
          );
        }
        if (part.type === 'entity') {
          return (
            <Text
              key={`ent-${idx}`}
              onPress={() => onEntityPress(part.data)}
              style={{ color: theme.tint, textDecorationLine: 'underline', fontWeight: 'bold' }}
            >
              {part.text}
            </Text>
          );
        }
        return null;
      })}
    </Text>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreamingRow: boolean;
  hasHistory: boolean;
  theme: any;
  searchTerms: SearchTerm[];
  onOpenTranscript: (id: string) => void;
  onEntityPress: (entity: any) => void;
}

// Memoized so a streamed token only re-renders the streaming row, not every
// bubble. Highlighting is skipped while the row is still streaming (or when
// there's nothing to match), which keeps per-token cost flat.
const MessageBubble = React.memo(function MessageBubble({
  message,
  isStreamingRow,
  hasHistory,
  theme,
  searchTerms,
  onOpenTranscript,
  onEntityPress,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const bubbleStyle = [
    styles.bubble,
    isUser
      ? [styles.userBubble, { backgroundColor: theme.tint }]
      : [styles.assistantBubble, { backgroundColor: theme.surface, borderColor: theme.divider }],
  ];

  if (isStreamingRow && !message.content) {
    return (
      <View style={bubbleStyle}>
        <TypingIndicator />
      </View>
    );
  }

  const stripped = message.content.replace(/\[ID:[^\]]+\]/g, '');
  const { actions, cleanText } = parseToolCalls(stripped);
  // Hide a tool call that hasn't finished streaming its closing tag yet.
  const cleanContent = cleanText.replace(/<tool_call>[\s\S]*$/, '').trim();

  const plain = isStreamingRow || !hasHistory || searchTerms.length === 0;

  return (
    <View style={bubbleStyle}>
      {plain
        ? !!cleanContent && (
            <Text style={{ color: isUser ? '#fff' : theme.text, lineHeight: 24 }}>{cleanContent}</Text>
          )
        : !!cleanContent &&
          renderHighlighted(cleanContent, searchTerms, isUser, theme, onOpenTranscript, onEntityPress)}
      {actions.map((act, i) => renderToolAction(act, i, theme))}
    </View>
  );
});

const TypingIndicator = () => {
  const { theme } = useTheme();
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnim = (anim: Animated.Value, delay: number) => 
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.delay(400)
          ])
        )
      ]);
    
    Animated.parallel([
      createAnim(anim1, 0),
      createAnim(anim2, 150),
      createAnim(anim3, 300)
    ]).start();
  }, [anim1, anim2, anim3]);

  const translateY = (anim: Animated.Value) => anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6]
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4 }}>
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.text, opacity: 0.6, marginRight: 4, transform: [{ translateY: translateY(anim1) }] }} />
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.text, opacity: 0.6, marginRight: 4, transform: [{ translateY: translateY(anim2) }] }} />
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.text, opacity: 0.6, transform: [{ translateY: translateY(anim3) }] }} />
    </View>
  );
};
