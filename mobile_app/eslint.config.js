// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*'],
  },
  {
    rules: {
      // Fires on `useRef(new Animated.Value(0)).current` - the standard RN idiom
      // for a stable Animated value, used ~60 times here. Reading .current in
      // render is safe for these; the rule is a false positive on this pattern
      // and would otherwise bury every real finding.
      'react-hooks/refs': 'off',
      // A perf hint, not a bug - and it fires on this codebase's core store
      // idiom (the subscribe hooks in downloadBanner / recordSheet /
      // downloadManager, keyboard listeners, reveal state), all reviewed
      // patterns with guards or memoized consumers. Lint is gated at
      // --max-warnings 0, where 'warn' would mean 'error', so it's off;
      // cascading renders are a review concern instead.
      'react-hooks/set-state-in-effect': 'off',
      // The lazy `require('llama.rn')` etc. are DELIBERATE - deferred native
      // loads so the module isn't pulled in on web / before it's needed.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
