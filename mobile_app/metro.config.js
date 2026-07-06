// Metro (React Native's bundler) config. `expo/metro-config` gives us the
// Expo-tuned defaults; we just need to tell it that .woff2 files are assets
// so `material-symbols/*.woff2` can be `require`d from expo-font.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('woff2');

module.exports = config;
