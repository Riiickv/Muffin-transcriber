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
 * Pushes screen content above the keyboard on focus. Uses
 * react-native-keyboard-controller's KeyboardAvoidingView because RN's built-in
 * one broke in Expo SDK 53+ with edge-to-edge and regressed further in 57.
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
