import { useState } from 'react';
import { View, StyleSheet, TextInput, ScrollView } from 'react-native';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Stack } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Card } from '@/components/Card';
import { SPACING, RADIUS } from '@/constants/tokens';
import { useMemory, useSuggestedMemories } from '@/utils/memoryStore';
import { haptics } from '@/utils/haptics';
import { useDialog } from '@/components/Dialog';
import { t } from '@/utils/i18n';
import { useResponsive } from '@/hooks/useResponsive';

export default function MemoryScreen() {
  const { theme } = useTheme();
  const { contentWidth } = useResponsive();
  const { items, addMemory, updateMemory, deleteMemory } = useMemory();
  const { items: suggested, accept: acceptSuggestion, dismiss: dismissSuggestion, dismissAll } = useSuggestedMemories();
  const dialog = useDialog();
  const [newMemory, setNewMemory] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = async () => {
    if (!newMemory.trim()) return;
    haptics.tap();
    await addMemory(newMemory);
    setNewMemory('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editValue.trim()) {
      setEditingId(null);
      return;
    }
    haptics.tap();
    await updateMemory(editingId, editValue);
    setEditingId(null);
  };

  const confirmDelete = (id: string, text: string) => {
    dialog.show({
      title: t('settings.deleteMemoryTitle') || 'Delete Memory?',
      message: `${t('dialog.confirmDelete.message')} "${text}"?`,
      icon: 'warning',
      iconTone: 'danger',
      buttons: [
        { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary' },
        {
          label: t('dialog.confirmDelete.delete') || 'Delete',
          variant: 'danger',
          onPress: () => {
            haptics.tap();
            deleteMemory(id);
          },
        },
      ],
    });
  };

  return (
    <KeyboardScreen offset={90}>
      {/* Capped: sceneStyle only covers tabs, and this is a pushed screen. */}
      <View style={[styles.container, { backgroundColor: theme.background }, { maxWidth: contentWidth, width: '100%', alignSelf: 'center' }]}>
        <Stack.Screen options={{ title: t('settings.manageMemory') || 'Manage Memory' }} />

        <Card style={styles.addCard}>
          <Text style={styles.sectionTitle}>{t('settings.addMemory') || 'Add Memory'}</Text>
          <Text style={[styles.description, { color: theme.textMuted }]}>
            {t('settings.addMemoryDesc') || 'Teach the AI specific names, jargon, or facts so it transcribes them perfectly.'}
          </Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.divider }]}
              value={newMemory}
              onChangeText={setNewMemory}
              placeholder={t('settings.addMemoryPlaceholder') || 'Add a custom memory'}
              placeholderTextColor={theme.textSubtle}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            <Button variant="primary" size="md" onPress={handleAdd} disabled={!newMemory.trim()}>
              {t('settings.addMemoryBtn') || 'Add'}
            </Button>
          </View>
        </Card>

        {/* Guesses the assistant made while transcribing. They are NOT memories
            until the user says so: a memory is fed into every later prompt, so
            a wrong one is invisible and compounds. The model proposes here and
            nothing else. */}
        {suggested.length > 0 && (
          <Card style={styles.addCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.sectionTitle}>
                {t('memory.suggestedTitle') || 'Did I get this right?'}
              </Text>
              <Button variant="ghost" size="sm" style={{ height: 32 }} onPress={() => { haptics.tap(); dismissAll(); }}>
                {t('memory.dismissAll') || 'No to all'}
              </Button>
            </View>
            <Text style={[styles.description, { color: theme.textMuted }]}>
              {t('memory.suggestedDesc') || "I picked these up from your recordings. I'm often wrong, so nothing is saved until you say yes."}
            </Text>
            {suggested.map((sug) => (
              <View
                key={sug.id}
                style={[styles.memoryRow, { borderColor: theme.divider, backgroundColor: theme.surface }]}
              >
                <Text style={{ flex: 1, fontSize: 15 }}>{sug.text}</Text>
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon="close"
                  onPress={() => { haptics.tap(); dismissSuggestion(sug.id); }}
                  accessibilityLabel={t('memory.dismissOne') || 'No'}
                />
                <IconButton
                  variant="tint"
                  size="sm"
                  icon="check"
                  onPress={() => { haptics.success(); acceptSuggestion(sug.id); }}
                  accessibilityLabel={t('memory.acceptOne') || 'Yes, remember this'}
                />
              </View>
            ))}
          </Card>
        )}

        <ScrollView contentContainerStyle={styles.listContent}>
          {items.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textSubtle }]}>
              {t('settings.noMemories') || 'No memories saved yet. Keep chatting or add them.'}
            </Text>
          ) : (
            items.map((item) => (
              <View key={item.id} style={[styles.memoryRow, { borderColor: theme.divider, backgroundColor: theme.surface }]}>
                {editingId === item.id ? (
                  <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.tint }]}
                    value={editValue}
                    onChangeText={setEditValue}
                    autoFocus
                    onBlur={handleSaveEdit}
                    onSubmitEditing={handleSaveEdit}
                    returnKeyType="done"
                  />
                ) : (
                  <Text 
                    style={styles.memoryText} 
                    onPress={() => {
                      setEditingId(item.id);
                      setEditValue(item.text);
                    }}
                  >
                    {item.text}
                  </Text>
                )}
                
                {editingId === item.id ? (
                  <IconButton
                    variant="tint"
                    size="sm"
                    icon="check"
                    onPress={handleSaveEdit}
                    accessibilityLabel={t('settings.saveMemory') || 'Save memory'}
                  />
                ) : (
                  <IconButton
                    variant="danger"
                    size="sm"
                    icon="delete"
                    onPress={() => confirmDelete(item.id, item.text)}
                    accessibilityLabel={t('settings.deleteMemoryAction') || 'Delete memory'}
                  />
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  addCard: {
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  description: {
    fontSize: 14,
    marginBottom: SPACING.md,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    fontSize: 16,
  },
  listContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  memoryText: {
    flex: 1,
    fontSize: 16,
    marginRight: SPACING.md,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    fontSize: 16,
    marginRight: SPACING.md,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: SPACING.xl,
    fontSize: 16,
  },
});
