import React from 'react';
import { View, Text, Pressable } from 'react-native';

/**
 * Last-resort net. If anything throws during React rendering, show a plain,
 * recoverable screen instead of a white-screen crash.
 *
 * Sits ABOVE the theme and font providers, so it deliberately uses none of them:
 * hardcoded brand colours and the system font, and text in English, because the
 * one moment this renders is the moment the rest of the app might be broken - it
 * must not depend on anything that could itself be the thing that failed.
 *
 * Honest scope: this catches errors thrown in render only. It does NOT catch
 * native crashes (a bad @android resource, a SIGILL) or errors thrown from
 * effects/async code - those need their own guards at the source (see the
 * Material You version-gate in ThemeProvider and the font fallback in _layout).
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed (caught by boundary):', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Muffin hit an unexpected error. Tap below to try again, or reopen the app.
        </Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = {
  root: {
    flex: 1,
    backgroundColor: '#1E1A1E',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 32,
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' as const, textAlign: 'center' as const, marginBottom: 12 },
  body: { color: '#B9B2BC', fontSize: 15, lineHeight: 22, textAlign: 'center' as const, marginBottom: 24 },
  button: { backgroundColor: '#F49CC4', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  buttonText: { color: '#1E1A1E', fontSize: 16, fontWeight: '700' as const },
};
