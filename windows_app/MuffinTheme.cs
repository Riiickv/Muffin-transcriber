using System;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace MuffinTranscriber;

// The Muffin accent, shared with the mobile app so both feel like one product.
//
// WinUI resolves {ThemeResource AccentFillColorDefaultBrush} once, when a
// control loads, and the control then holds a reference to whatever brush
// object it found. So we install OUR brush instances into Application.Resources
// before any window exists, and later only MUTATE their Color: every control
// pointing at them repaints immediately, which is what makes the accent picker
// apply live instead of demanding a restart.
public static class MuffinTheme
{
    public const string DefaultAccent = "Muffin";

    // Same four accents the mobile app offers.
    public static readonly (string Key, string Hex)[] Accents =
    [
        ("Muffin", "#FF9EBB"),
        ("Green", "#65D28A"),
        ("Purple", "#A975C2"),
        ("Red", "#ED6F62"),
    ];

    private static readonly SolidColorBrush FillDefault = new();
    private static readonly SolidColorBrush FillSecondary = new();
    private static readonly SolidColorBrush FillTertiary = new();
    private static readonly SolidColorBrush TextOnAccentPrimary = new();
    private static readonly SolidColorBrush TextOnAccentSecondary = new();
    private static readonly SolidColorBrush AccentText = new();

    private static bool _installed;

    /// <summary>
    /// Installs the accent brushes. Must run BEFORE the first window is built,
    /// otherwise controls resolve the stock system accent and never see ours.
    /// </summary>
    public static void Install(string accentKey)
    {
        if (!_installed)
        {
            var resources = Application.Current.Resources;

            // Button/toggle/progress/selection fills.
            resources["AccentFillColorDefaultBrush"] = FillDefault;
            resources["AccentFillColorSecondaryBrush"] = FillSecondary;
            resources["AccentFillColorTertiaryBrush"] = FillTertiary;
            resources["AccentFillColorSelectedTextBackgroundBrush"] = FillDefault;

            // Text drawn ON the accent. The stock value is white, which is
            // unreadable on the light Muffin pink, so this is not optional.
            resources["TextOnAccentFillColorPrimaryBrush"] = TextOnAccentPrimary;
            resources["TextOnAccentFillColorSecondaryBrush"] = TextOnAccentSecondary;

            // Accent-coloured TEXT (hyperlinks). Uses a darkened accent so it
            // stays legible against a light page instead of glowing.
            resources["AccentTextFillColorPrimaryBrush"] = AccentText;
            resources["AccentTextFillColorSecondaryBrush"] = AccentText;
            resources["AccentTextFillColorTertiaryBrush"] = AccentText;

            _installed = true;
        }

        Apply(accentKey);
    }

    /// <summary>Repaints every accented control. Safe to call at any time.</summary>
    public static void Apply(string accentKey)
    {
        Color accent = ParseHex(HexFor(accentKey));

        FillDefault.Color = accent;
        // WinUI's own convention for the hover/pressed steps: same hue, less alpha.
        FillSecondary.Color = WithAlpha(accent, 0.90);
        FillTertiary.Color = WithAlpha(accent, 0.80);

        Color onAccent = Foreground(accent);
        TextOnAccentPrimary.Color = onAccent;
        TextOnAccentSecondary.Color = WithAlpha(onAccent, 0.75);

        AccentText.Color = Darken(accent, 0.35);

        // Not live-updatable (it is a Color, not a brush), but keeping it in
        // sync means anything resolving it later gets the right hue.
        Application.Current.Resources["SystemAccentColor"] = accent;
    }

    public static string HexFor(string accentKey)
    {
        foreach ((string key, string hex) in Accents)
        {
            if (string.Equals(key, accentKey, StringComparison.OrdinalIgnoreCase)) return hex;
        }
        return Accents[0].Hex;
    }

    public static Color ParseHex(string hex)
    {
        string clean = hex.TrimStart('#');
        byte r = Convert.ToByte(clean.Substring(0, 2), 16);
        byte g = Convert.ToByte(clean.Substring(2, 2), 16);
        byte b = Convert.ToByte(clean.Substring(4, 2), 16);
        return Color.FromArgb(255, r, g, b);
    }

    // Black on light accents (Muffin pink, green), white on the darker ones
    // (purple, red). Same relative-luminance rule the mobile app uses, so a
    // given accent pairs identically on both platforms.
    private static Color Foreground(Color c)
    {
        static double Channel(byte v)
        {
            double s = v / 255.0;
            return s <= 0.03928 ? s / 12.92 : Math.Pow((s + 0.055) / 1.055, 2.4);
        }

        double luminance = 0.2126 * Channel(c.R) + 0.7152 * Channel(c.G) + 0.0722 * Channel(c.B);
        return luminance > 0.4 ? Colors.Black : Colors.White;
    }

    private static Color WithAlpha(Color c, double alpha) =>
        Color.FromArgb((byte)Math.Clamp(alpha * 255, 0, 255), c.R, c.G, c.B);

    private static Color Darken(Color c, double amount)
    {
        double keep = Math.Clamp(1 - amount, 0, 1);
        return Color.FromArgb(c.A, (byte)(c.R * keep), (byte)(c.G * keep), (byte)(c.B * keep));
    }
}
