import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TextInput, FlatList, Platform, Animated, Easing, Keyboard, Pressable } from 'react-native';
import { Stack, router } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SPACING, RADIUS, TAB_BAR_SPACE, MOTION, FLOATING_CHROME, floatingChromeColors } from '@/constants/tokens';
import { useSettings } from '@/utils/settingsStore';
import { ModelManager } from '@/utils/ModelManager';
import { chatStream, ChatMessage } from '@/utils/ChatEngine';
import { extractMemories, parseModelJson } from '@/utils/LLMEngine';
import { haptics } from '@/utils/haptics';
import { useHistory, updateHistoryItem, HistoryItem } from '@/utils/historyStore';
import { useChats, addChatSession, updateChatMessages, renameChatSession, deleteChatSession, appendActionNote, titleFromMessage } from '@/utils/chatStore';
import { ChatDrawer } from '@/components/ChatDrawer';
import { FadeInView } from '@/components/FadeInView';
import { InlineSettingControl } from '@/components/InlineSettingControl';
import { getSettingSpec } from '@/utils/appCapabilities';
import * as IntentLauncher from 'expo-intent-launcher';
import { useDialog, DialogCard } from '@/components/Dialog';
import { errorToMessage } from '@/utils/errors';
import { t } from '@/utils/i18n';
import { useResponsive } from '@/hooks/useResponsive';

// Stable per-message key so the FlatList can memoize rows instead of re-keying
// by index (which re-renders every bubble on each streamed token).
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Parses <tool_call>…</tool_call> tags (plus a bare {"action":…} JSON fallback)
// out of an LLM reply. Returns the parsed actions and the text with the tags
// stripped, so execution (handleSend) and rendering (MessageBubble) share one
// grammar instead of maintaining two copies that can drift.
// Words that only exist because of how this app is wired. None of them belong
// in a reply to someone who just wants their voice note renamed. Deliberately
// NOT including "action" - "I'll take action" is ordinary English.
//
// Also here: the model explaining the app's behaviour back to the user - "The
// app shows the confirmation dialog itself, so I will not say I've done it."
// That is the prompt's rules being recited to the one person who should never
// read them. Nobody asking to rename a voice note wants a briefing on how the
// app works, and "dialog"/"confirmation"/"the user will" only ever appear when
// the model is narrating its instructions instead of answering.
//
// "[action result]" and "the user answered" are ours: they're the private notes
// the app writes into the conversation so the model knows what its calls
// actually did. The model reads them (that's the point) and then recites them
// back verbatim, so the user sees "[action result] The user answered: renamed
// X to Y" as if the app were talking to itself. Anything wearing that shape is
// ours, never a reply.
const MECHANICS_TALK = /tool[ _-]?calls?|<tool|\bjson\b|\bemit\b|\bpayload\b|history_index|app_settings|transcript_id|new_name|\[action result\]|the user answered|\bdialog\b|\bconfirmation\b|the app (shows|will|asks)|\bthe user (will|can|cannot|sees|see)\b/i;

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

  // Small models narrate the mechanics ("Here is the tool_call:") instead of
  // writing a sentence. The block itself is never shown, so that text describes
  // something invisible.
  //
  // Stripped UNCONDITIONALLY, not just once a call has parsed: while the reply
  // streams in token by token the call is still incomplete, so actions is empty
  // and the guarded version left the user reading "Here is the tool_call:"
  // followed by raw JSON until the closing tag arrived. No genuine reply ever
  // contains this phrase, so there is nothing to lose by always removing it.
  // Drop any SENTENCE that talks about the plumbing, rather than matching set
  // phrases. Chasing exact wording was a losing game: "Here is the tool_call:"
  // became "Here is the corrected tool_call:" became "Emit the following
  // tool_call:" - a language model has infinite ways to say it, and each new
  // one shipped to the user before anyone noticed. What every version has in
  // common is naming machinery the user can't see, so that's what we test for.
  // Sentence-level, so a good sentence beside a bad one survives:
  // "I can rename the latest transcript. Emit the following tool_call:" keeps
  // the first half and loses the second.
  // Split on . ! ? only - NOT on ':'. A colon splitter cut "[action result] The
  // user answered:" away from the text that followed it, so the marker was
  // dropped and its payload sailed through as its own innocent-looking
  // sentence. The marker and what it introduces are one unit.
  cleanText = (cleanText.match(/[^.!?]+[.!?]*/g) || [])
    .filter((sentence) => !MECHANICS_TALK.test(sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Same reason: a bare {"action": ...} that hasn't finished streaming isn't
  // matched as a tool call yet and would render as gibberish. Only anchored to
  // an "action" key so ordinary prose containing a brace survives.
  cleanText = cleanText.replace(/\{\s*"?action"?[\s\S]*$/i, '').trim();

  // An echoed private note, taken out whole: from the marker to the end of the
  // line, regardless of how the model punctuates it.
  cleanText = cleanText.replace(/\[action result\][^\n]*/gi, '').trim();

  return { actions, cleanText };
}

export default function ChatScreen() {
  const { theme, themeMode, accentColor, setThemeMode, setAccentColor } = useTheme();
  const { contentWidth } = useResponsive();
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

  // Set when the assistant asks for a rename without saying what to call it.
  // The send button lights up as soon as there's something to send.
  const canSend = !!input.trim() && !isGenerating;
  const sendGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(sendGlow, { toValue: canSend ? 1 : 0, useNativeDriver: true, ...MOTION.springStandard }).start();
  }, [canSend, sendGlow]);

  const [pendingRename, setPendingRename] = useState<HistoryItem | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const [activeEntity, setActiveEntity] = useState<any>(null);
  const [actionName, setActionName] = useState('');

  // The list's FRAME never shrinks when the keyboard opens - the composer just
  // slides up over it - so the keyboard simply covers the bottom of the list.
  // scrollToEnd alone could never fix that: "the end" was still underneath the
  // keyboard, which is why scrolling up and opening the keyboard hid the newest
  // messages with no way to reach them.
  //
  // Padding the content by the keyboard's height gives those messages somewhere
  // to go, and THEN scrolling to the end lands them above it.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);
      // After the padding has been laid out, not before.
      requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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

  /**
   * Which transcript a tool call means. THE one implementation.
   *
   * This logic used to exist twice - once in the executor, once for the chip -
   * and every single time they drifted apart the chip started claiming things
   * the executor never did. Both now call this, so they cannot disagree.
   *
   * The newest-transcript fallback is rename-only: the rename dialog names what
   * it's about to touch, so a wrong guess is visible and cancellable. Deleting
   * never guesses.
   */
  const getTarget = useCallback(
    (act: any): HistoryItem | undefined => {
      const items = historyItems || [];
      let target = act?.transcript_id ? items.find((h) => h.id === act.transcript_id) : undefined;
      if (!target && act?.transcript_name) {
        const search = String(act.transcript_name).toLowerCase();
        target = items.find((h) => {
          const name = h.sourceFileName.replace(/\.[^/.]+$/, '').toLowerCase();
          return name === search || name.includes(search) || search.includes(name);
        });
      }
      if (!target && String(act?.action ?? '').toUpperCase() === 'RENAME_TRANSCRIPT') {
        target = [...items].sort(
          (a, b) => new Date(b.timestampISO).getTime() - new Date(a.timestampISO).getTime()
        )[0];
      }
      return target;
    },
    [historyItems]
  );

  /**
   * The name a rename call would actually apply, or '' if it hasn't given one.
   *
   * A rename to the name it ALREADY has counts as no name at all. The model
   * confuses the two fields and echoes the current name back as new_name, which
   * renames X to X - a no-op the app then reported as "Done". Treating it as
   * "no name given" routes it to the dialog, where the user just types the name.
   */
  const renameTargetName = useCallback(
    (act: any, target: HistoryItem | undefined): string => {
      const proposed = String(act?.new_name ?? act?.name ?? '').trim();
      if (!proposed || !target) return '';
      const current = target.sourceFileName.replace(/\.[^/.]+$/, '');
      return proposed.toLowerCase() === current.toLowerCase() ? '' : proposed;
    },
    []
  );

  const handleDeleteChat = async (id: string) => {
    // Capture the row's position BEFORE deleting - it's what decides the
    // replacement, and the list is gone by the time the store updates.
    const index = chatSessions.findIndex((c) => c.id === id);
    const remaining = chatSessions.filter((c) => c.id !== id);
    await deleteChatSession(id);

    // Deleting some other chat from the drawer shouldn't yank you out of the
    // one you're reading.
    if (id !== activeChatId) return;

    if (remaining.length === 0) {
      // Never sit on a deleted chat waiting for the user to make a new one.
      const newId = await addChatSession(t('chat.newChat') || 'New Chat');
      setActiveChatId(newId);
      setMessages([]);
      return;
    }

    // The list is newest-first and unsorted, so whatever now occupies the
    // deleted row's index is the chat created just BEFORE it. Deleting the
    // oldest leaves no older one, so clamp to the end of the list.
    const next = remaining[Math.min(index, remaining.length - 1)];
    setActiveChatId(next.id);
    setMessages(next.messages || []);
  };

  // Action-result notes are system turns: fed to the model so it knows what its
  // tool calls actually did, but hidden here - the user already watched the
  // dialog and the transcript disappear, and MessageBubble would render them as
  // the assistant talking to itself (anything not role 'user' draws as a bot
  // bubble). ListEmptyComponent keys off this too, so a chat holding only notes
  // still shows the empty state.
  const visibleMessages = useMemo(() => messages.filter((m) => m.role !== 'system'), [messages]);

  const activeModel = settings.preferredChatModel || settings.preferredFormatterModel;

  const handleSend = async () => {
    if (!input.trim() || !activeModel || isGenerating) return;

    // Selected is not the same as present. The Record tab has always checked
    // this; Chat went straight to loading, so a model missing from disk died
    // inside llama.rn with a bare "Failed to load model". Checked up front,
    // before any message state changes, so there is nothing to unwind.
    if (!(await ModelManager.isModelDownloaded(activeModel))) {
      dialog.show({
        title: t('dialog.modelNotDownloaded.title') || 'Model not downloaded',
        message: t('dialog.modelNotDownloaded.messageChat') || 'Go to Settings > Models to download chat model.',
        icon: 'download',
      });
      return;
    }

    // Catch the truncated-download case BEFORE llama.cpp does, with numbers.
    // Downloads made before the .part fix could leave a fraction of the model
    // under its real filename; llama.cpp only says "Failed to load model",
    // which diagnoses nothing. "312 MB of ~814 MB" settles it in one glance.
    const check = await ModelManager.verifyModelFile(activeModel);
    if (!check.ok) {
      const mb = (n: number) => `${Math.round(n / 1e6)} MB`;
      dialog.show({
        title: t('chat.modelBrokenTitle') || 'Chat model incomplete',
        message:
          (t('chat.modelBrokenMessage') ||
            'The model file is {actual} but should be about {expected}. The download was interrupted. Delete it in Settings > Models, then download it again and stay on that screen until it finishes.')
            .replace('{actual}', mb(check.actualBytes))
            .replace('{expected}', mb(check.expectedBytes)),
        icon: 'warning',
        iconTone: 'danger',
      });
      return;
    }

    // Name the chat after the first thing said in it. Two paths reach here:
    // no chat yet (created on send), or an empty chat made by the + button,
    // which is already titled "New Chat" and needs renaming. Only the FIRST
    // message names it - later ones would rewrite a title the user is reading,
    // and may have renamed themselves.
    const isFirstMessage = messages.length === 0;
    let targetChatId = activeChatId;
    if (!targetChatId) {
      targetChatId = await addChatSession(titleFromMessage(input.trim()));
      setActiveChatId(targetChatId);
    } else if (isFirstMessage) {
      await renameChatSession(targetChatId, titleFromMessage(input.trim()));
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
        // REVIEW FLAG (2026-07-20): extractMemories runs on LLMEngine's MAIN
        // context, but chat generates on ChatEngine's SEPARATE context. This
        // loads the model a SECOND time (RAM pressure / possible OOM on device),
        // and it's unqueued, so if a recording's enrichment is running on the
        // main context it can collide with it. Only reachable with BOTH chat
        // beta AND context-learning on (both default off), so it's flagged not
        // fixed - the real fix is a design call: run this on the chat context,
        // or skip memory extraction while chatting.
        extractMemories(userMsg.content, modelPath, activeModel).catch(console.warn);
      }

      const botResponse = finalMessages[finalMessages.length - 1].content;
      // Captured once: the dialog callbacks below fire whenever the user taps,
      // which may be long after this function has returned.
      const chatId = targetChatId;
      // Target resolution lives in getTarget, shared with the chip renderer so
      // the two can never disagree about what a call means.

      const executeTool = async (toolCall: any) => {
         if (!toolCall || !toolCall.action) return;
         const action = String(toolCall.action).toUpperCase();

         if (action === 'NAVIGATE_TO' && toolCall.tab) {
            let tab = String(toolCall.tab).toLowerCase();
            if (tab === 'home') tab = 'index';
            if (tab === 'preferences') tab = 'settings';
            router.push((tab === 'memory' ? '/memory' : `/(tabs)/${tab}`) as any);
            await appendActionNote(targetChatId, `Opened the ${tab} screen.`);
         } else if (action === 'RENAME_TRANSCRIPT') {
            const target = getTarget(toolCall);
            if (!target) {
               await appendActionNote(chatId, `FAILED: there are no transcripts at all, so there is nothing to rename.`);
            } else {
               // ALWAYS ask, never rename straight from the model's text.
               //
               // A 1B model got the name wrong three different ways in one
               // evening: it invented one ("Dentist", lifted from a prompt
               // example), it echoed the current name back (renaming X to X),
               // and it appended instead of replacing ("PTT-20260709-WA0021" +
               // "-Palle"). Each time the app dutifully wrote the wrong name to
               // the user's data and reported success.
               //
               // The name is free text: there is no way to validate it, and
               // getting it wrong quietly corrupts something the user cares
               // about. So the model's job shrinks to what it CAN do - work out
               // which transcript is meant - and the name comes from the person
               // who knows it, who is right here and already typing. Its
               // suggestion, if it made a sensible one, is prefilled: one tap
               // when it's right, one edit when it isn't, never silently wrong.
               const currentName = target.sourceFileName.replace(/\.[^/.]+$/, '');
               const proposed = renameTargetName(toolCall, target);
               setPendingRename(target);
               setRenameInput(proposed || currentName);
               await appendActionNote(
                  chatId,
                  proposed
                     ? `Suggested renaming "${currentName}" to "${proposed}" and asked the user to confirm. Do not claim it is renamed until they do.`
                     : `Asked the user what to call "${currentName}". Wait for their answer.`
               );
            }
         } else if (action === 'SHOW_SETTING') {
            // Display-only: the control renders in the bubble, nothing to run.
            // But an unknown key renders nothing at all, so say so.
            if (!toolCall.key || !getSettingSpec(String(toolCall.key))) {
               await appendActionNote(chatId, `FAILED: there is no setting called "${toolCall.key}", so nothing was shown.`);
            }
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
               await appendActionNote(targetChatId, `Set "${spec.label}" to ${val}.`);
            } else {
               // Tell it the key was wrong. Otherwise it insists next turn that
               // it already did the thing, having no idea the call went nowhere.
               await appendActionNote(targetChatId, `FAILED: there is no setting called "${toolCall.key}". Use a key from <app_settings>.`);
            }
         } else {
            // An action we don't have. It used to fall through silently while
            // the bubble still displayed a green "Done" chip for it.
            await appendActionNote(chatId, `FAILED: "${action}" is not one of your actions and did nothing.`);
         }
      };

      const { actions } = parseToolCalls(botResponse);

      // Deletions are batched into ONE confirmation naming every transcript.
      // dialog.show() REPLACES whatever dialog is open rather than queueing, so
      // running three deletes through the normal loop would fire three dialogs
      // in a row and leave only the last one on screen - the user would confirm
      // a single delete believing all three were gone, and the other two would
      // vanish silently. One dialog, one list, one decision.
      // The model sometimes answers "the latest transcript is called X" and
      // emits no call whatsoever, leaving a plain request dead. The app can read
      // "rename" perfectly well on its own, so when the user clearly asked and
      // nothing came back, it opens the dialog itself rather than shrugging.
      // Over-eager at worst (a dialog you cancel); the alternative is a feature
      // that works only when a 1B model is having a good day.
      if (RENAME_INTENT.test(userMsg.content) && !actions.some((a) => String(a?.action ?? '').toUpperCase() === 'RENAME_TRANSCRIPT')) {
        const newest = [...(historyItems || [])].sort(
          (a, b) => new Date(b.timestampISO).getTime() - new Date(a.timestampISO).getTime()
        )[0];
        if (newest) {
          setPendingRename(newest);
          setRenameInput(newest.sourceFileName.replace(/\.[^/.]+$/, ''));
        }
      }

      const isDelete = (a: any) => String(a?.action ?? '').toUpperCase() === 'DELETE_TRANSCRIPT';
      const deleteCalls = actions.filter(isDelete);
      const otherCalls = actions.filter((a) => !isDelete(a));

      for (const toolCall of otherCalls) {
        try {
          await executeTool(toolCall);
        } catch (e) {
          console.error("Tool execution failed", e);
        }
      }

      if (deleteCalls.length > 0) {
        const resolved = deleteCalls
          .map(getTarget)
          .filter((x): x is HistoryItem => !!x);
        // The model can name the same transcript twice; deleting it twice is
        // harmless but listing it twice looks broken.
        const targets = resolved.filter((t, i) => resolved.findIndex((x) => x.id === t.id) === i);
        const nameOf = (h: HistoryItem) => h.sourceFileName.replace(/\.[^/.]+$/, "");

        if (targets.length === 1) {
          dialog.show({
            title: t('chat.deleteTitle') || 'Delete transcript?',
            message: (t('chat.deleteMessage') || "Delete “{name}”? This can't be undone.").replace('{name}', nameOf(targets[0])),
            icon: 'delete',
            iconTone: 'danger',
            buttons: [
              {
                label: t('dialog.confirmDelete.cancel') || 'Cancel',
                variant: 'secondary',
                // A cancel is a real outcome. Without it the model believes the
                // delete went through and says so next turn.
                onPress: () => { appendActionNote(chatId, `The user CANCELLED deleting "${nameOf(targets[0])}". It still exists.`); },
              },
              {
                label: t('chat.delete') || 'Delete',
                variant: 'danger',
                onPress: () => {
                  deleteItem(targets[0].id);
                  appendActionNote(chatId, `Deleted the transcript "${nameOf(targets[0])}".`);
                },
              },
            ],
          });
        } else if (targets.length > 1) {
          dialog.show({
            title: (t('chat.deleteManyTitle') || 'Delete {count} transcripts?').replace('{count}', String(targets.length)),
            message: (t('chat.deleteManyMessage') || "These will be deleted:\n{list}\n\nThis can't be undone.")
              .replace('{list}', targets.map((tg) => `• ${nameOf(tg)}`).join('\n')),
            icon: 'delete',
            iconTone: 'danger',
            buttons: [
              {
                label: t('dialog.confirmDelete.cancel') || 'Cancel',
                variant: 'secondary',
                onPress: () => { appendActionNote(chatId, `The user CANCELLED deleting ${targets.length} transcripts. They all still exist.`); },
              },
              {
                label: t('chat.delete') || 'Delete',
                variant: 'danger',
                onPress: () => {
                  targets.forEach((tg) => deleteItem(tg.id));
                  appendActionNote(chatId, `Deleted ${targets.length} transcripts: ${targets.map(nameOf).join(', ')}.`);
                },
              },
            ],
          });
        }
      }

      haptics.success();
    } catch (e) {
      console.error(e);
      const errorMsgs: ChatMessage[] = [
        ...newMessages,
        {
          role: 'assistant',
          // Show what ACTUALLY went wrong. The old text blamed the model not
          // being downloaded or selected - but you cannot reach this screen
          // without a selected model (it shows the "No Chat Model Selected"
          // state instead), so that advice was always wrong AND it hid the real
          // error. Anything that throws here is a genuine failure worth naming.
          content: t('chat.errorMessage') + '\n\n' + errorToMessage(e),
        }
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
      {/* index={3} = Chat's position in the tab bar. FadeInView slides from the
          right when you move forward through the tabs and from the left going
          back, so the index has to match the real order or the screen flies in
          from the wrong side. Chat was added as a tab and never got one, which
          is why it appeared with no transition at all. */}
      <FadeInView index={3} style={[styles.container, { backgroundColor: theme.background }]}>
          <Stack.Screen 
            options={{ 
              // A plain `title` string, like every other tab - a custom
              // headerTitle component doesn't inherit the navigator's title
              // styling or alignment, which is why "Chat" sat low and indented
              // while the other tabs' titles didn't.
              // It names the active chat rather than restating the tab.
              title: chatSessions.find((c) => c.id === activeChatId)?.title ?? t('chat.header'),
              // Hamburger in headerLeft - the one affordance everyone already
              // reads as "there's a list behind this". The old trigger was an
              // icon+"Chat" in the *title* slot, which looks exactly like a
              // title, so nothing suggested it was tappable.
              // IconButton, not a bare AnimatedPressable: the latter's inner
              // view uses alignSelf:'stretch', so inside the header's
              // vertically-centred container it stretches to full header height
              // and the icon settles at the TOP - which is what made the
              // hamburger sit above the title line. IconButton has an explicit
              // box and centres its icon, so it's unaffected.
              headerLeft: () => (
                <IconButton
                  variant="ghost"
                  size="md"
                  icon="menu"
                  onPress={() => setIsDrawerOpen(true)}
                  accessibilityLabel={t('chat.chats')}
                  style={{ marginLeft: SPACING.sm }}
                />
              ),
              headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Beta badge: the chat leans on a 1B model doing tool-calls,
                      which is the least reliable thing the app does. Saying so
                      up front turns a rough reply from "this app is broken" into
                      "this part is still cooking" - honest, and it's what a Play
                      reviewer needs to see before they poke it. */}
                  <Pressable
                    onPress={() => {
                      haptics.tap();
                      dialog.show({
                        title: t('chat.betaTitle'),
                        message: t('chat.betaBody'),
                        buttons: [{ label: t('chat.betaOk'), variant: 'primary' }],
                      });
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [styles.betaBadge, { backgroundColor: theme.tintFill, opacity: pressed ? 0.6 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.betaTitle')}
                  >
                    <Text style={{ color: theme.tint, fontSize: 11, fontWeight: '700' }}>
                      {t('chat.beta')}
                    </Text>
                  </Pressable>
                  <IconButton
                    variant="ghost"
                    size="md"
                    icon="add"
                    onPress={async () => {
                      const id = await addChatSession(t('chat.newChat'));
                      setActiveChatId(id);
                      setMessages([]);
                      setIsDrawerOpen(false);
                    }}
                    accessibilityLabel={t('chat.newChat')}
                    style={{ marginRight: SPACING.sm }}
                  />
                </View>
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
            {/* Explicit height: an unsized Button inside this centered
                container balloons to fill it (AnimatedPressable's inner
                surface uses flexGrow). Same fix as WaitingCard. */}
            <Button
              variant="primary"
              style={{ marginTop: SPACING.lg, height: 44 }}
              onPress={() => router.push('/models' as any)}
            >
              {t('models.goToModels') || 'Get a model'}
            </Button>
          </View>
        ) : (
          <>
            <FlatList 
              ref={flatListRef}
              data={visibleMessages}
              keyExtractor={(item, idx) => item.id ?? idx.toString()}
              contentContainerStyle={[styles.chatContainer, { paddingBottom: SPACING.xxl + kbHeight }]}
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
                  getTarget={getTarget}
                  renameTargetName={renameTargetName}
                />
              )}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            {/* Sticks to the keyboard via translateY - no frame measurement,
                no header offset to get wrong. `opened` gives back the space
                reserved for the floating tab bar, which hides while typing. */}
            <KeyboardStickyView offset={{ closed: 0, opened: TAB_BAR_SPACE }}>
            <View
              style={[
                styles.inputRow,
                floatingChromeColors(theme.isDark),
                // Capped and centred like the tab bar directly beneath it - on a
                // tablet an edge-to-edge composer under a centred pill would
                // look like two unrelated things.
                { maxWidth: contentWidth - SPACING.lg * 2, width: '100%', alignSelf: 'center' },
              ]}
            >
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
                style={[styles.sendButton, { backgroundColor: theme.divider }]}
                onPress={handleSend}
                disabled={!canSend}
                accessibilityLabel="Send"
              >
                {/* The accent is painted on a layer whose OPACITY animates,
                    rather than interpolating backgroundColor: with the 'system'
                    accent on Android theme.tint is a PlatformColor object, and
                    no animator can interpolate one ("platform colors are not
                    supported" - the crash that took out the tab bar). Opacity
                    also rides the native driver, so this stays smooth while a
                    reply is streaming. */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: theme.tint, borderRadius: RADIUS.pill },
                    { opacity: sendGlow },
                  ]}
                />
                <Icon name={isGenerating ? 'more-horiz' : 'arrow-upward'} size={20} color="#fff" filled />
              </AnimatedPressable>
            </View>
            </KeyboardStickyView>
          </>
        )}
      </FadeInView>
      {/* Asked for when the assistant wants to rename but has no name. Same
          shape as History's rename dialog, so it looks like the app asking
          rather than the chat improvising. */}
      <DialogCard
        visible={pendingRename !== null}
        onRequestClose={() => setPendingRename(null)}
        icon="edit"
        iconTone="tint"
        title={t('chat.renameAskTitle') || 'What should I call it?'}
        message={pendingRename ? (t('chat.renameAskMessage') || 'Renaming "{name}"').replace('{name}', pendingRename.sourceFileName.replace(/\.[^/.]+$/, '')) : undefined}
        buttons={[
          { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary', onPress: () => setPendingRename(null) },
          {
            label: t('history.saveRename') || 'Save',
            variant: 'primary',
            onPress: () => {
              const name = renameInput.trim();
              const target = pendingRename;
              setPendingRename(null);
              if (!target || !name) return;
              const oldName = target.sourceFileName.replace(/\.[^/.]+$/, '');
              updateHistoryItem(target.id, { sourceFileName: name });
              if (activeChatId) {
                appendActionNote(activeChatId, `The user answered: renamed "${oldName}" to "${name}".`);
              }
            },
          },
        ]}
      >
        <TextInput
          style={[styles.renameInput, { color: theme.text, borderColor: theme.divider }]}
          value={renameInput}
          onChangeText={setRenameInput}
          autoFocus
          selectTextOnFocus
          placeholder={t('chat.renameAskTitle') || 'What should I call it?'}
          placeholderTextColor={theme.textSubtle}
        />
      </DialogCard>

      <ChatDrawer 
        isVisible={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        chats={chatSessions} 
        activeChatId={activeChatId} 
        onSelectChat={(id) => {
          setActiveChatId(id);
          setIsDrawerOpen(false);
        }}
        onDeleteChat={handleDeleteChat} 
      />

      {activeEntity && (
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
            <Text style={styles.dialogTitle}>
              {t('chat.addTo') || 'Add to'} {activeEntity.type === 'date' ? (t('chat.calendar') || 'Calendar') : (t('chat.alarms') || 'Alarms')}
            </Text>
            <Text style={[styles.dialogQuote, { color: theme.textMuted }]}>
              {`"${activeEntity.quote}"`}
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
  betaBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    marginRight: SPACING.xs,
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
  // A rounded, bordered composer rather than a full-bleed bar with a top rule.
  // The floating tab bar lifts this off the bottom edge, so an edge-anchored
  // bar would hang in mid-air with a border pointing at nothing.
  // Same shape, surface and shadow as the tab bar pill below it - they're two
  // halves of one floating strip, and they used to be a rounded box in
  // theme.surface sitting under a white pill.
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    // Even padding all round: paddingLeft: SPACING.md pushed the field 16px off
    // the left edge while the button sat 6px off the right, so the contents sat
    // visibly off-centre inside the pill.
    padding: SPACING.xs + 2,
    marginHorizontal: SPACING.lg,
    marginBottom: TAB_BAR_SPACE,
    gap: SPACING.sm,
    ...FLOATING_CHROME,
  },
  // The dialog's own field. NOT styles.input - that one is the composer's,
  // with flex:1 and a maxHeight, which collapses inside a dialog body.
  renameInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    fontSize: 16,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    // Pill, matching the shell around it. A RADIUS.md box inside a pill read as
    // a rounded rectangle floating in a lozenge - two shapes, one control.
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  sendButton: {
    // 40 to match the field's minHeight exactly. At 36 it sat 4px shy of the
    // field's bottom edge and read as misaligned - which it was.
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
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
    fontWeight: 'bold',
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

// Only these are carried out at all. Gating on the action NAME was not enough:
// a RENAME_TRANSCRIPT with no new_name is refused by the executor, yet still
// matched this set and drew a green "Done: RENAME_TRANSCRIPT" for a rename that
// never happened. So the chip now also checks the call carries what the
// executor needs to act on - the same conditions executeTool tests, kept
// deliberately next to each other.
// "Rename" in the six languages the app speaks. Only used to open a dialog the
// user can cancel, so a false positive costs a tap - unlike a missed one, which
// costs the feature.
const RENAME_INTENT = /\b(rename|renaming|rinomin\w*|chiamal\w*|rinominar\w*|renombr\w*|ll[aá]mal\w*|renomm\w*|umbenenn\w*|renomei\w*|renomear)\b/i;

const EXECUTED_ACTIONS = new Set([
  'DELETE_TRANSCRIPT',
  'RENAME_TRANSCRIPT',
  'NAVIGATE_TO',
  'SET_SETTING',
]);

/**
 * Does this call carry enough for the executor to actually do it?
 *
 * Uses the SAME resolver and the same name check the executor uses, passed in
 * from the screen. Every earlier version of this re-implemented the rules and
 * drifted, and each drift showed the user a "Done" for work that never
 * happened.
 */
function isActionable(
  act: any,
  getTarget: (act: any) => HistoryItem | undefined,
  renameTargetName: (act: any, target: HistoryItem | undefined) => string
): boolean {
  const a = String(act?.action ?? '').toUpperCase();
  switch (a) {
    case 'DELETE_TRANSCRIPT':
      return !!getTarget(act);
    case 'RENAME_TRANSCRIPT': {
      const target = getTarget(act);
      return !!target && !!renameTargetName(act, target);
    }
    case 'NAVIGATE_TO':
      return !!act?.tab;
    case 'SET_SETTING':
      return act?.key !== undefined && !!getSettingSpec(String(act.key)) && act?.value !== undefined;
    default:
      return false;
  }
}

// Shown when the model emitted an action that could not be carried out - an
// invented one, or a setting key that doesn't exist. Rendering nothing at all
// left an EMPTY bubble on screen, which reads as the app hanging; the honest
// answer is to say it didn't work.
function ActionFailedChip({ theme }: { theme: any }) {
  return (
    <View style={{ marginTop: 8, padding: 8, backgroundColor: theme.textSubtle + '20', borderRadius: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' }}>
      <Icon name="warning" size={16} color={theme.textMuted} />
      <Text style={{ color: theme.textMuted, marginLeft: 6, fontSize: 12, fontWeight: 'bold' }}>
        {t('chat.actionFailed') || "Couldn't do that"}
      </Text>
    </View>
  );
}

function renderToolAction(
  act: any,
  i: number,
  theme: any,
  getTarget: (act: any) => HistoryItem | undefined,
  renameTargetName: (act: any, target: HistoryItem | undefined) => string
) {
  const a = String(act.action || '').toUpperCase();
  if (a === 'SET_SETTING' || a === 'SHOW_SETTING') {
    const spec = act.key ? getSettingSpec(String(act.key)) : undefined;
    // No such setting: no control to render and nothing changed.
    return spec
      ? <InlineSettingControl key={`set-${i}`} settingKey={String(act.key)} />
      : <ActionFailedChip key={`fail-${i}`} theme={theme} />;
  }
  // Rename never draws a "Done": the app asks the user to confirm the name, so
  // at the moment this renders nothing has been renamed yet. The dialog is the
  // answer; a chip beside it would be claiming an outcome that hasn't happened.
  if (a === 'RENAME_TRANSCRIPT') {
    return getTarget(act) ? null : <ActionFailedChip key={`fail-${i}`} theme={theme} />;
  }
  if (!EXECUTED_ACTIONS.has(a) || !isActionable(act, getTarget, renameTargetName)) {
    return <ActionFailedChip key={`fail-${i}`} theme={theme} />;
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
  /** Which transcript a tool call means - the executor's own resolver. */
  getTarget: (act: any) => HistoryItem | undefined;
  /** The name a rename would apply, or '' if it hasn't really given one. */
  renameTargetName: (act: any, target: HistoryItem | undefined) => string;
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
  getTarget,
  renameTargetName,
}: MessageBubbleProps) {
  // Gentle entrance: fade in and rise 6px when the bubble mounts.
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const isUser = message.role === 'user';
  const bubbleStyle = [
    styles.bubble,
    isUser
      ? [styles.userBubble, { backgroundColor: theme.tint }]
      : [styles.assistantBubble, { backgroundColor: theme.surface, borderColor: theme.divider }],
    {
      opacity: entrance,
      transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
    },
  ];

  if (isStreamingRow && !message.content) {
    return (
      <Animated.View style={bubbleStyle}>
        <TypingIndicator />
      </Animated.View>
    );
  }

  const stripped = message.content.replace(/\[ID:[^\]]+\]/g, '');
  const { actions, cleanText } = parseToolCalls(stripped);
  // Hide a tool call that hasn't finished streaming its closing tag yet.
  const cleanContent = cleanText.replace(/<tool_call>[\s\S]*$/, '').trim();

  const plain = isStreamingRow || !hasHistory || searchTerms.length === 0;

  // Nothing to say and nothing to show. Happens when a reply is pure tool_call
  // and the call itself renders nothing. The styled bubble would still paint,
  // leaving a blank pill sitting in the thread - so draw no bubble at all. The
  // streaming row is exempt: it starts empty by definition and the typing
  // indicator lives there.
  if (!isStreamingRow && !cleanContent && actions.length === 0) return null;

  return (
    <Animated.View style={bubbleStyle}>
      {plain
        ? !!cleanContent && (
            <Text style={{ color: isUser ? '#fff' : theme.text, lineHeight: 24 }}>{cleanContent}</Text>
          )
        : !!cleanContent &&
          renderHighlighted(cleanContent, searchTerms, isUser, theme, onOpenTranscript, onEntityPress)}
      {actions.map((act, i) => renderToolAction(act, i, theme, getTarget, renameTargetName))}
    </Animated.View>
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
