using System;
using System.Collections.Generic;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace MuffinTranscriber;

/// <summary>
/// The Muffin accent, shared with the mobile app so both feel like one product.
///
/// The brushes themselves are declared statically in App.xaml's
/// ThemeDictionaries (see the comment there - declaring them from code does NOT
/// reach the {ThemeResource} lookups inside built-in control templates). This
/// class finds those brush instances and only changes their Color, so every
/// control already pointing at them repaints instantly and the accent picker
/// needs no restart.
/// </summary>
public static class MuffinTheme
{
    public const string DefaultAccent = "Muffin";

    // Same options as the mobile app, plus System (Android follows the OS
    // accent through Material You; Windows has one too).
    public static readonly (string Key, string Hex)[] Accents =
    [
        ("Muffin", "#FF9EBB"),
        ("Green", "#65D28A"),
        ("Purple", "#A975C2"),
        ("Red", "#ED6F62"),
    ];

    // The user's Windows accent, read once before anything overwrites it.
    public static Color WindowsAccent { get; } =
        new Windows.UI.ViewManagement.UISettings().GetColorValue(Windows.UI.ViewManagement.UIColorType.Accent);

    // Every brush that carries the accent, collected from both theme
    // dictionaries so light and dark stay in step.
    private static readonly List<SolidColorBrush> Fills = [];
    private static readonly List<SolidColorBrush> FillsSecondary = [];
    private static readonly List<SolidColorBrush> FillsTertiary = [];
    private static readonly List<SolidColorBrush> OnAccentPrimary = [];
    private static readonly List<SolidColorBrush> OnAccentSecondary = [];
    private static readonly List<SolidColorBrush> AccentTexts = [];

    private static bool _collected;

    /// <summary>Applies the saved accent. Call once, before the first window.</summary>
    public static void Install(string accentKey)
    {
        if (!_collected)
        {
            foreach (string theme in new[] { "Default", "Light" })
            {
                if (Application.Current.Resources.ThemeDictionaries.TryGetValue(theme, out object? entry)
                    && entry is ResourceDictionary dictionary)
                {
                    Collect(Fills, dictionary, "AccentFillColorDefaultBrush");
                    Collect(Fills, dictionary, "AccentFillColorSelectedTextBackgroundBrush");
                    Collect(Fills, dictionary, "SystemControlHighlightAccentBrush");
                    Collect(FillsSecondary, dictionary, "AccentFillColorSecondaryBrush");
                    Collect(FillsTertiary, dictionary, "AccentFillColorTertiaryBrush");
                    Collect(OnAccentPrimary, dictionary, "TextOnAccentFillColorPrimaryBrush");
                    Collect(OnAccentPrimary, dictionary, "TextOnAccentFillColorSelectedTextBrush");
                    Collect(OnAccentSecondary, dictionary, "TextOnAccentFillColorSecondaryBrush");
                    Collect(AccentTexts, dictionary, "AccentTextFillColorPrimaryBrush");
                    Collect(AccentTexts, dictionary, "AccentTextFillColorSecondaryBrush");
                    Collect(AccentTexts, dictionary, "AccentTextFillColorTertiaryBrush");
                }
            }

            _collected = true;
        }

        Apply(accentKey);
    }

    private static void Collect(List<SolidColorBrush> into, ResourceDictionary dictionary, string key)
    {
        if (dictionary.TryGetValue(key, out object? value) && value is SolidColorBrush brush)
        {
            into.Add(brush);
        }
    }

    /// <summary>Repaints every accented control. Safe to call at any time.</summary>
    public static void Apply(string accentKey)
    {
        Color accent = string.Equals(accentKey, "System", StringComparison.OrdinalIgnoreCase)
            ? WindowsAccent
            : ParseHex(HexFor(accentKey));

        foreach (SolidColorBrush brush in Fills) brush.Color = accent;
        // WinUI's own convention for hover/pressed: same hue, less alpha.
        foreach (SolidColorBrush brush in FillsSecondary) brush.Color = WithAlpha(accent, 0.90);
        foreach (SolidColorBrush brush in FillsTertiary) brush.Color = WithAlpha(accent, 0.80);

        Color onAccent = Foreground(accent);
        foreach (SolidColorBrush brush in OnAccentPrimary) brush.Color = onAccent;
        foreach (SolidColorBrush brush in OnAccentSecondary) brush.Color = WithAlpha(onAccent, 0.75);

        // Accent-coloured TEXT (hyperlinks) needs to survive its background, so
        // it is darkened on light themes and lightened on dark ones.
        Color darkened = Darken(accent, 0.35);
        Color lightened = Lighten(accent, 0.25);
        for (int i = 0; i < AccentTexts.Count; i++)
        {
            // Collected dark-theme-first, three keys per dictionary.
            AccentTexts[i].Color = i < 3 ? lightened : darkened;
        }

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
    // (purple, red). The same relative-luminance rule the mobile app uses, so a
    // given accent pairs identically on both platforms - and so a saturated
    // Windows accent stays readable when "System" is picked.
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

    private static Color Lighten(Color c, double amount)
    {
        double mix = Math.Clamp(amount, 0, 1);
        return Color.FromArgb(
            c.A,
            (byte)(c.R + (255 - c.R) * mix),
            (byte)(c.G + (255 - c.G) * mix),
            (byte)(c.B + (255 - c.B) * mix));
    }
}
