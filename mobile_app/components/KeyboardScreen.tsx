import React from 'react';
import { Platform, StyleProp, ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

interface KeyboardScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Pixels the view should offset above the keyboard. Set to the height of a
   * fixed header/nav above the screen content. Defaults to 0.
   */
  offset?: number;
}

/**
 * Wraps a screen so its content is pushed above the on-screen keyboard when a
 * TextInput gains focus.
 *
 * Uses `react-native-keyboard-controller`'s KeyboardAvoidingView instead of
 * React Native's built-in one. Why:
 *   - RN's KAV broke in Expo SDK 53+ once edge-to-edge display was enabled
 *     (github.com/expo/expo issue tracker + Expo docs), and the same behavior
 *     regressed further in 57.
 *   - keyboard-controller runs the animation on the UI thread via Reanimated
 *     worklets, so the compression stays in sync with the keyboard slide.
 *   - Cross-platform: same `behavior="padding"` works reliably on both iOS
 *     and Android, no more per-platform branching.
 */
export const KeyboardScreen = ({ children, style, offset = 0 }: KeyboardScreenProps) => {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
};
