import { FlatList, Modal, Pressable, StyleSheet, View, TextInput } from 'react-native';
import React, { useState } from 'react';
import { router } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { RADIUS, SPACING, TAB_BAR_SPACE } from '@/constants/tokens';
import { useHistory, HistoryItem } from '@/utils/historyStore';
import { useDialog } from '@/components/Dialog';
import { formatDuration, formatHistoryDate } from '@/utils/format';
import { t } from '@/utils/i18n';

const formatItem = (item: HistoryItem) => ({
  ...item,
  date: formatHistoryDate(item.timestampISO),
  // Only show a duration once we actually have one (backfilled on first play),
  // rather than a fake 0:00.
  duration: item.audioDurationMs ? formatDuration(item.audioDurationMs / 1000) : null,
  title: item.sourceFileName.replace(/\.[^/.]+$/, ''),
  snippet: item.summary || item.rawTranscript || '',
});

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

  return (
    <FadeInView index={2} style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const entry = formatItem(item);
          return (
            <HistoryCard
              entry={entry}
              onOpen={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
              onDelete={() => confirmDelete(item)}
              onRename={() => {
                setRenameInput(entry.title || '');
                setPendingRename(item);
              }}
            />
          );
        }}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 }}>
            <Icon name="history" size={64} color={theme.textSubtle} />
            <Text style={{ marginTop: SPACING.md, color: theme.textMuted, fontSize: 16 }}>{t('history.noHistory') || 'No transcripts yet.'}</Text>
          </View>
        }
      />

      <Modal
        animationType="fade"
        transparent
        visible={pendingRename !== null}
        onRequestClose={() => setPendingRename(null)}
      >
        <View style={styles.modalOverlay}>
          {/* Scrim tap cancels the rename, same as the back button. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPendingRename(null)} />
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

/**
 * One transcript in the History list.
 *
 * Was three IconButtons in three different colours (red / grey / pink), one of
 * which - the chevron - just repeated what tapping the card already does. Three
 * competing colours on every row turns a list into noise, and a button that
 * duplicates its own container is a decision the user shouldn't have to make.
 * Now: tap the card to open, two quiet ghost actions, and the row leads with an
 * icon so the list scans vertically.
 *
 * NOTE: no accessibilityRole="button" on the card. react-native-web maps that
 * to a real <button>, and the two IconButtons inside are buttons too - nesting
 * them is invalid HTML and throws a hydration error. Without the role the card
 * renders as a div and stays perfectly tappable on native.
 */
const HistoryCard = React.memo(({ entry, onOpen, onDelete, onRename }: HistoryCardProps) => {
  const { theme } = useTheme();
  return (
    <AnimatedPressable
      onPress={onOpen}
      scaleTo={0.985}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.leadIcon, { backgroundColor: theme.tintFill }]}>
          <Icon name="waveform" size={18} color={theme.tint} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.titleText} numberOfLines={1}>{entry.title}</Text>
          <Text style={[styles.date, { color: theme.textMuted }]} numberOfLines={1}>
            {entry.date}{entry.duration ? ` · ${entry.duration}` : ''}
          </Text>
        </View>

        <View style={styles.actions}>
          <IconButton variant="ghost" size="sm" icon="edit" onPress={onRename} accessibilityLabel="Rename transcript" />
          <IconButton variant="ghost" size="sm" icon="delete" onPress={onDelete} accessibilityLabel="Delete transcript" />
        </View>
      </View>

      {!!entry.snippet && (
        <Text style={[styles.preview, { color: theme.textMuted }]} numberOfLines={2}>
          {entry.snippet}
        </Text>
      )}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  list: {
    padding: SPACING.lg,
    paddingBottom: TAB_BAR_SPACE,
  },
  card: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leadIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  titleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: SPACING.sm,
    // Align under the title, past the leading icon.
    marginLeft: 36 + SPACING.md,
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
