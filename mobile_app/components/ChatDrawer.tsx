import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { AnimatedPressable } from './AnimatedPressable';
import { useDialog } from './Dialog';
import { MOTION, RADIUS, SPACING } from '@/constants/tokens';
import { ChatSession, deleteChatSession, renameChatSession } from '@/utils/chatStore';
import { formatRelativeTime } from '@/utils/format';
import { t } from '@/utils/i18n';

interface ChatDrawerProps {
  isVisible: boolean;
  onClose: () => void;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
}

export function ChatDrawer({ isVisible, onClose, chats, activeChatId, onSelectChat }: ChatDrawerProps) {
  const { theme } = useTheme();
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(screenWidth * 0.8, 340);

  // Mounted only while open (or animating closed) — a permanently-composited
  // full-screen overlay costs frames on every chat render.
  const [rendered, setRendered] = useState(isVisible);
  const progress = useRef(new Animated.Value(0)).current;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    if (isVisible) {
      setRendered(true);
      // Material standard: decelerate in...
      Animated.timing(progress, {
        toValue: 1,
        duration: MOTION.timingBase.duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      // ...accelerate out, then unmount.
      Animated.timing(progress, {
        toValue: 0,
        duration: MOTION.timingQuick.duration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
      setEditingId(null);
    }
  }, [isVisible, progress]);

  if (!rendered) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });

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

  const renderRow = ({ item: chat }: { item: ChatSession }) => {
    const isActive = chat.id === activeChatId;
    const isEditing = chat.id === editingId;

    return (
      <View
        style={[
          styles.chatItem,
          { backgroundColor: isActive ? theme.tintFill : 'transparent' },
        ]}
      >
        <AnimatedPressable
          onPress={() => {
            if (!isEditing) onSelectChat(chat.id);
          }}
          style={styles.chatItemMain}
          disabled={isEditing}
        >
          {isEditing ? (
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.divider },
              ]}
              value={editTitle}
              onChangeText={setEditTitle}
              autoFocus
              onBlur={() => handleRename(chat.id)}
              onSubmitEditing={() => handleRename(chat.id)}
              returnKeyType="done"
            />
          ) : (
            <View style={styles.chatItemText}>
              <Text
                style={[styles.chatTitle, { color: isActive ? theme.tint : theme.text }]}
                numberOfLines={1}
              >
                {chat.title}
              </Text>
              <Text style={[styles.chatSubtitle, { color: theme.textSubtle }]}>
                {formatRelativeTime(chat.updatedAt)}
              </Text>
            </View>
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
  };

  return (
    // A Modal so the drawer overlays the WHOLE screen (header and tab bar
    // included) — rendered inline it only covered the tab content area,
    // leaving the header undimmed and a dead inset gap up top. Also makes the
    // Android back button close the drawer.
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdropOpacity }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close chat list" />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            backgroundColor: theme.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('chat.chats') || 'Chats'}</Text>
          <IconButton
            variant="ghost"
            size="sm"
            icon="close"
            onPress={onClose}
            accessibilityLabel="Close chat list"
          />
        </View>

        <FlatList
          data={chats}
          keyExtractor={(chat) => chat.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="forum" size={48} color={theme.textSubtle} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('chat.noChats') || 'No chats yet.'}</Text>
              <Text style={[styles.emptyHint, { color: theme.textSubtle }]}>
                {t('chat.noChatsHint') || 'Start a new one from the chat screen.'}
              </Text>
            </View>
          }
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopRightRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
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
    paddingLeft: SPACING.xl,
    paddingRight: SPACING.md,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Nunito-Bold',
  },
  list: {
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: 2,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    paddingRight: SPACING.xs,
  },
  chatItemMain: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
  },
  chatItemText: {
    gap: 1,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  chatSubtitle: {
    fontSize: 12,
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
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl * 2,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
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
