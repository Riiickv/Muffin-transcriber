// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*'],
  },
  {
    rules: {
      // Fires on `useRef(new Animated.Value(0)).current` - the standard RN idiom
      // for a stable Animated value, used ~60 times here. Reading .current in
      // render is safe for these; the rule is a false positive on this pattern
      // and would otherwise bury every real finding.
      'react-hooks/refs': 'off',
      // A perf hint, not a bug. The one case here (useClientOnlyValue) is the
      // documented client-hydration pattern. Keep it visible, don't block on it.
      'react-hooks/set-state-in-effect': 'warn',
      // The lazy `require('llama.rn')` etc. are DELIBERATE - deferred native
      // loads so the module isn't pulled in on web / before it's needed.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
