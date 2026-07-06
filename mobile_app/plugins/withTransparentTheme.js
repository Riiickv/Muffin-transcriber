const { withAndroidStyles } = require('@expo/config-plugins');

module.exports = function withTransparentTheme(config) {
  return withAndroidStyles(config, async (config) => {
    const styles = config.modResults;
    const appTheme = styles.resources.style.find((style) => style.$.name === 'AppTheme');
    if (appTheme) {
      appTheme.item.push({ _: 'true', $: { name: 'android:windowIsTranslucent' } });
      appTheme.item.push({ _: '@android:color/transparent', $: { name: 'android:windowBackground' } });
    }
    return config;
  });
};
