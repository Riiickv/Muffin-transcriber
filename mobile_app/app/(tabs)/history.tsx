import { Modal, ScrollView, StyleSheet, View, Pressable, TextInput } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { RADIUS, SPACING } from '@/constants/tokens';
import { useHistory, HistoryItem } from '@/utils/historyStore';
import { useDialog } from '@/components/Dialog';
import { t } from '@/utils/i18n';

const formatItem = (item: HistoryItem) => {
  const dateStr = new Date(item.timestampISO).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  const durSecs = item.audioDurationMs ? Math.floor(item.audioDurationMs / 1000) : 0;
  const min = Math.floor(durSecs / 60);
  const sec = durSecs % 60;
  const durStr = `${min}:${sec.toString().padStart(2, '0')}`;
  const snippet = item.summary || item.rawTranscript || '';
  return {
    ...item,
    date: dateStr,
    duration: durStr,
    title: item.sourceFileName.replace(/\.[^/.]+$/, ""),
    snippet: snippet,
  };
};

export default function HistoryScreen() {
  const { theme } = useTheme();
  const { items, deleteItem, addOrUpdate } = useHistory();
  const dialog = useDialog();
  const [pendingRename, setPendingRename] = useState<HistoryItem | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const confirmDelete = (entry: HistoryItem) => {
    dialog.show({
      title: t('dialog.confirmDelete.title') || 'Delete Transcript?',
      message: `${t('dialog.confirmDelete.message')} "${entry.sourceFileName.replace(/\.[^/.]+$/, "")}"`,
      icon: 'warning',
      iconTone: 'danger',
      buttons: [
        { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary' },
        { label: t('dialog.confirmDelete.delete') || 'Delete', variant: 'danger', onPress: () => deleteItem(entry.id) },
      ],
    });
  };

  const formattedItems = items.map(formatItem);

  return (
    <FadeInView index={2} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.list}>
        {formattedItems.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 }}>
            <Icon name="history" size={64} color={theme.textSubtle} />
            <Text style={{ marginTop: SPACING.md, color: theme.textMuted, fontSize: 16 }}>{t('history.noHistory') || 'No transcripts yet.'}</Text>
          </View>
        ) : (
          formattedItems.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              onOpen={() => router.push({ pathname: '/history/[id]', params: { id: entry.id } })}
              onDelete={() => confirmDelete(entry)}
              onRename={() => {
                setRenameInput(entry.title || '');
                setPendingRename(entry);
              }}
            />
          ))
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={pendingRename !== null}
        onRequestClose={() => setPendingRename(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.divider }]}>
            <Text style={styles.modalTitle}>{t('history.renameTranscript') || 'Rename Transcript'}</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.divider, width: '100%' }]}
              value={renameInput}
              onChangeText={setRenameInput}
              autoFocus
              selectTextOnFocus
            />
            <View style={[styles.modalButtons, { marginTop: SPACING.xl }]}>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" size="lg" onPress={() => setPendingRename(null)}>
                  {t('dialog.confirmDelete.cancel') || 'Cancel'}
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="primary" size="lg" onPress={() => {
                  if (pendingRename && renameInput.trim()) {
                    addOrUpdate({ ...pendingRename, sourceFileName: renameInput.trim() });
                  }
                  setPendingRename(null);
                }}>
                  {t('history.saveRename') || 'Save'}
                </Button>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </FadeInView>
  );
}

interface HistoryCardProps {
  entry: ReturnType<typeof formatItem>;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
}

// Plain View (not Pressable) at the card level, so the two action IconButtons
// and the chevron IconButton don't end up nested inside another button — which
// react-native-web forbids (renders a hydration error on <button> in <button>).
// Users tap the chevron to open; the whole title/preview area is dimmed for
// visual affordance.
const HistoryCard = ({ entry, onOpen, onDelete, onRename }: HistoryCardProps) => {
  const { theme } = useTheme();
  return (
    <Pressable style={({ pressed }) => [styles.card, { borderColor: theme.divider, opacity: pressed ? 0.7 : 1 }]} onPress={onOpen}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titleText}>{entry.title}</Text>
          <Text style={[styles.date, { color: theme.textMuted }]}>
            {entry.date} • {entry.duration}
          </Text>
        </View>

        <View style={styles.actions}>
          <IconButton
            variant="danger"
            size="sm"
            icon="delete"
            onPress={onDelete}
            accessibilityLabel="Delete transcript"
          />
          <IconButton
            variant="subtle"
            size="sm"
            icon="edit"
            onPress={onRename}
            accessibilityLabel="Rename transcript"
          />
          <IconButton
            variant="tint"
            size="sm"
            icon="chevron-right"
            onPress={onOpen}
            accessibilityLabel={`Open ${entry.title}`}
          />
        </View>
      </View>
      <Text style={[styles.preview, { color: theme.textMuted }]} numberOfLines={2}>
        {entry.snippet}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  list: {
    padding: SPACING.lg,
  },
  card: {
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.lg,
    backgroundColor: 'transparent',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  date: {
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  preview: {
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: RADIUS.lg,
    padding: SPACING.xxl,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    marginTop: SPACING.lg,
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
});
