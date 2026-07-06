const MUFFIN_ACCENT = '#FF9EBB';
const DANGER = '#ED6F62';

export default {
  light: {
    text: '#000000',
    textMuted: 'rgba(0,0,0,0.6)',
    textSubtle: 'rgba(0,0,0,0.3)',
    background: '#FFFFFF',
    surface: 'rgba(0,0,0,0.05)',
    surfaceStrong: 'rgba(0,0,0,0.10)',
    divider: 'rgba(0,0,0,0.12)',
    tint: MUFFIN_ACCENT,
    tabIconDefault: '#CCCCCC',
    tabIconSelected: MUFFIN_ACCENT,
    danger: DANGER,
    dangerSurface: 'rgba(237,111,98,0.12)',
  },
  dark: {
    text: '#FFFFFF',
    textMuted: 'rgba(255,255,255,0.6)',
    textSubtle: 'rgba(255,255,255,0.3)',
    background: '#121212',
    surface: 'rgba(255,255,255,0.06)',
    surfaceStrong: 'rgba(255,255,255,0.12)',
    divider: 'rgba(255,255,255,0.15)',
    tint: MUFFIN_ACCENT,
    tabIconDefault: '#444444',
    tabIconSelected: MUFFIN_ACCENT,
    danger: DANGER,
    dangerSurface: 'rgba(237,111,98,0.20)',
  },
};
