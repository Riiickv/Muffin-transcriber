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
    // Mobile defaults to the system accent (Material You) and falls back to
    // Muffin where the system has none; Windows always has one, so System is
    // simply the default here too.
    public const string DefaultAccent = "System";

    // Same options as the mobile app: System + the four fixed accents.
    public static readonly (string Key, string Hex)[] Accents =
    [
        ("Muffin", "#FF9EBB"),
        ("Green", "#65D28A"),
        ("Purple", "#A975C2"),
        ("Red", "#ED6F62"),
    ];

    // The user's Windows accent, captured ONCE before Apply() overwrites the
    // SystemAccentColor resource - after that, the resource is ours.
    public static Color WindowsAccent { get; } =
        new Windows.UI.ViewManagement.UISettings().GetColorValue(Windows.UI.ViewManagement.UIColorType.Accent);

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
            // These MUST go into the app's ThemeDictionaries, not into
            // Application.Resources directly. A {ThemeResource} lookup consults
            // the theme dictionaries first, so plain top-level entries lose to
            // XamlControlsResources and the buttons keep painting themselves
            // with the user's Windows accent instead of the Muffin pink.
            foreach (string theme in new[] { "Default", "Light" })
            {
                if (Application.Current.Resources.ThemeDictionaries.TryGetValue(theme, out object? entry)
                    && entry is ResourceDictionary dictionary)
                {
                    InstallInto(dictionary);
                }
            }

            // Belt and braces for any lookup that bypasses the theme dictionaries.
            InstallInto(Application.Current.Resources);

            _installed = true;
        }

        Apply(accentKey);
    }

    // The same brush instances go into every theme (the accent does not change
    // with light/dark), which is also what keeps live switching working: one
    // object to mutate, every control repaints.
    private static void InstallInto(ResourceDictionary dictionary)
    {
        dictionary["AccentFillColorDefaultBrush"] = FillDefault;
        dictionary["AccentFillColorSecondaryBrush"] = FillSecondary;
        dictionary["AccentFillColorTertiaryBrush"] = FillTertiary;
        dictionary["AccentFillColorSelectedTextBackgroundBrush"] = FillDefault;
        dictionary["SystemControlHighlightAccentBrush"] = FillDefault;
        dictionary["SystemAccentColorBrush"] = FillDefault;

        // Text drawn ON the accent. The stock value is white, unreadable on the
        // light Muffin pink, so this is not optional.
        dictionary["TextOnAccentFillColorPrimaryBrush"] = TextOnAccentPrimary;
        dictionary["TextOnAccentFillColorSecondaryBrush"] = TextOnAccentSecondary;
        dictionary["TextOnAccentFillColorSelectedTextBrush"] = TextOnAccentPrimary;

        // Accent-coloured TEXT (hyperlinks): darkened so it stays legible
        // against a light page instead of glowing.
        dictionary["AccentTextFillColorPrimaryBrush"] = AccentText;
        dictionary["AccentTextFillColorSecondaryBrush"] = AccentText;
        dictionary["AccentTextFillColorTertiaryBrush"] = AccentText;
    }

    /// <summary>Repaints every accented control. Safe to call at any time.</summary>
    public static void Apply(string accentKey)
    {
        Color accent = string.Equals(accentKey, "System", StringComparison.OrdinalIgnoreCase)
            ? WindowsAccent
            : ParseHex(HexFor(accentKey));

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
