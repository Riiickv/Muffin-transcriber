import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { AnimatedPressable } from './AnimatedPressable';
import { useDialog } from './Dialog';
import { MOTION, RADIUS, SPACING } from '@/constants/tokens';
import { ChatSession, deleteChatSession, renameChatSession } from '@/utils/chatStore';
import { t } from '@/utils/i18n';

interface ChatDrawerProps {
  isVisible: boolean;
  onClose: () => void;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 360);

export function ChatDrawer({ isVisible, onClose, chats, activeChatId, onSelectChat }: ChatDrawerProps) {
  const { theme } = useTheme();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: isVisible ? 0 : -DRAWER_WIDTH,
        duration: isVisible ? MOTION.timingBase.duration : MOTION.timingQuick.duration,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: isVisible ? 0.6 : 0,
        duration: isVisible ? MOTION.timingBase.duration : MOTION.timingQuick.duration,
        useNativeDriver: true,
      }),
    ]).start();
    if (!isVisible) setEditingId(null);
  }, [isVisible, slideAnim, backdropAnim]);

  const handleRename = async (id: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      await renameChatSession(id, trimmed);
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    const target = chats.find((c) => c.id === id);
    dialog.show({
      title: t('dialog.clearChat.title') || 'Delete Chat?',
      message: target ? `"${target.title}" ${t('dialog.deleteChatTarget') || 'will be permanently deleted.'}` : (t('dialog.deleteChatFallback') || 'This chat will be permanently deleted.'),
      icon: 'warning',
      iconTone: 'danger',
      buttons: [
        { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary' },
        { label: t('dialog.confirmDelete.delete') || 'Delete', variant: 'danger', onPress: () => deleteChatSession(id) },
      ],
    });
  };

  return (
    <View
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 100 }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdropAnim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: theme.background,
            borderRightColor: theme.divider,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <Text style={styles.headerTitle}>{t('settings.preferredChat') || 'Chats'}</Text>
          <IconButton
            variant="ghost"
            size="sm"
            icon="close"
            onPress={onClose}
            accessibilityLabel="Close chat list"
          />
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {chats.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="chat" size={56} color={theme.textSubtle} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('chat.noChats') || 'No chats yet.'}</Text>
              <Text style={[styles.emptyHint, { color: theme.textSubtle }]}>
                {t('chat.noChatsHint') || 'Start a new one from the chat screen.'}
              </Text>
            </View>
          ) : (
            chats.map((chat) => {
              const isActive = chat.id === activeChatId;
              const isEditing = chat.id === editingId;
              const rowBg = isActive ? theme.tintFill : 'transparent';
              const rowBorder = isActive ? theme.tint : theme.divider;
              const textColor = isActive ? theme.tint : theme.text;

              return (
                <View
                  key={chat.id}
                  style={[
                    styles.chatItem,
                    { backgroundColor: rowBg, borderColor: rowBorder },
                  ]}
                >
                  <AnimatedPressable
                    onPress={() => {
                      if (!isEditing) onSelectChat(chat.id);
                    }}
                    style={styles.chatItemMain}
                    disabled={isEditing}
                  >
                    <Icon name="chat" size={20} color={textColor} filled={isActive} />
                    {isEditing ? (
                      <TextInput
                        style={[
                          styles.input,
                          {
                            color: theme.text,
                            backgroundColor: theme.surface,
                            borderColor: theme.divider,
                          },
                        ]}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        autoFocus
                        onBlur={() => handleRename(chat.id)}
                        onSubmitEditing={() => handleRename(chat.id)}
                        returnKeyType="done"
                      />
                    ) : (
                      <Text
                        style={[styles.chatTitle, { color: textColor, fontWeight: isActive ? '600' : '400' }]}
                        numberOfLines={1}
                      >
                        {chat.title}
                      </Text>
                    )}
                  </AnimatedPressable>

                  {!isEditing && (
                    <View style={styles.actions}>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        icon="edit"
                        onPress={() => {
                          setEditingId(chat.id);
                          setEditTitle(chat.title);
                        }}
                        accessibilityLabel={t('chat.renameChat') || 'Rename chat'}
                      />
                      <IconButton
                        variant="ghost"
                        size="sm"
                        icon="delete"
                        onPress={() => handleDelete(chat.id)}
                        accessibilityLabel={t('chat.deleteChat') || 'Delete chat'}
                      />
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    borderRightWidth: 1,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 6, height: 0 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  list: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingRight: SPACING.xs,
  },
  chatItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  chatTitle: {
    flex: 1,
    fontSize: 15,
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
  },
});
