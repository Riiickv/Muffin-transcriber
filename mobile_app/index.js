// Custom entry point.
//
// The download foreground service must register its runner and its notification
// event handlers BEFORE the app renders - and in the headless JS context Android
// spins up when a notification button is pressed while the app is dead. So we do
// it here, at the very top of the entry, then hand off to expo-router.
//
// require() for expo-router/entry, not import: ES imports are hoisted, so an
// `import 'expo-router/entry'` would run before this line. require() runs in
// order, guaranteeing the service is registered first.
import { initDownloadForegroundService } from '@/utils/downloadForegroundService';

initDownloadForegroundService();

require('expo-router/entry');
