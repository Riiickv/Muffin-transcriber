import type { StyleProp, TextStyle } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import type { ActionableEntity } from '@/utils/entityExtraction';

/**
 * A transcript with the Butler's dates and times underlined and tappable.
 *
 * Moved out of the History detail so the Muffin! tab can show the same thing
 * on a transcript that has only just been made.
 */
export function HighlightedText({
  text,
  highlights,
  onPress,
  style,
}: {
  text: string;
  highlights: ActionableEntity[];
  onPress: (entity: ActionableEntity) => void;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();

  if (highlights.length === 0) {
    return <Text style={[style, { color: theme.text }]}>{text}</Text>;
  }

  let parts: { text: string; entity: ActionableEntity | null }[] = [{ text, entity: null }];

  // Naive split for each entity quote
  for (const entity of highlights) {
    const next: typeof parts = [];
    for (const part of parts) {
      if (part.entity) {
        next.push(part);
        continue;
      }
      const split = part.text.split(entity.quote);
      for (let i = 0; i < split.length; i++) {
        next.push({ text: split[i], entity: null });
        if (i < split.length - 1) next.push({ text: entity.quote, entity });
      }
    }
    parts = next.filter((p) => p.text.length > 0);
  }

  return (
    <Text style={[style, { color: theme.text }]}>
      {parts.map((part, i) => {
        const entity = part.entity;
        return entity ? (
          <Text
            key={i}
            style={{ color: theme.tint, textDecorationLine: 'underline', fontWeight: 'bold' }}
            onPress={() => onPress(entity)}
          >
            {part.text}
          </Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        );
      })}
    </Text>
  );
}
