import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Ricky's Buy Me a Coffee page. The ONLY link the app ever opens.
 *
 * Worth being deliberate about, given the app's whole promise is "100% local":
 * this opens only when the user taps the support button, and nothing about them
 * or their transcripts goes with it - it's a plain page load, no analytics, no
 * identifiers, no query string. Model downloads remain the only other network
 * traffic the app makes.
 */
export const SUPPORT_URL = 'https://buymeacoffee.com/riiickv';

/**
 * Opens the support page in an in-app browser tab (Chrome Custom Tab on
 * Android, SFSafariViewController on iOS).
 *
 * openBrowserAsync rather than Linking.openURL: the user stays inside the app
 * and comes back with one tap instead of having to app-switch, and the tab
 * still shows the real URL bar - which matters on a page that asks for money,
 * because it's how someone verifies they're on the genuine site. Falls back to
 * handing the URL to the OS if no browser can be embedded.
 */
/**
 * The privacy policy, opened in an in-app browser tab like the support page.
 *
 * The GitHub-hosted markdown is the single source of truth: the same URL Play
 * Console points at, so the in-app link and the store's link can never say
 * different things. Nothing about the user is sent - it's a plain page load.
 */
export const PRIVACY_URL =
  'https://github.com/Riiickv/Muffin-transcriber/blob/main/PRIVACY.md';

export async function openPrivacyPolicy(): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(PRIVACY_URL);
  } catch {
    try {
      await Linking.openURL(PRIVACY_URL);
    } catch {
      // No browser at all; the tap does nothing rather than crash.
    }
  }
}

export async function openSupportPage(): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(SUPPORT_URL);
  } catch {
    try {
      await Linking.openURL(SUPPORT_URL);
    } catch {
      // Both paths failed (no browser at all). Nothing useful to say to the
      // user here that isn't noise - the tap simply does nothing.
    }
  }
}
