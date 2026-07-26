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
    private static readonly List<SolidColorBrush> Tints = [];

    private static bool _collected;

    /// <summary>Applies the saved accent. Call once, before the first window.</summary>
    public static void Install(string accentKey)
    {
        if (!_collected)
        {
            // Walk the WHOLE resource tree, ours and WinUI's, and grab every
            // brush registered under an accent key. Trying to reason about
            // which dictionary wins the ThemeResource lookup cost two failed
            // fixes; recolouring all of them cannot lose, because whichever
            // one a control template resolves is a brush we are holding.
            CollectFrom(Application.Current.Resources, 0);
            _collected = true;
        }

        Apply(accentKey);
    }

    private static void CollectFrom(ResourceDictionary dictionary, int depth)
    {
        if (depth > 6) return; // resource trees are shallow; this is a cycle guard

        try
        {
            CollectKeys(dictionary);

            foreach (object themed in dictionary.ThemeDictionaries.Values)
            {
                if (themed is ResourceDictionary themeDictionary) CollectFrom(themeDictionary, depth + 1);
            }

            foreach (ResourceDictionary merged in dictionary.MergedDictionaries)
            {
                CollectFrom(merged, depth + 1);
            }
        }
        catch
        {
            // A dictionary that refuses enumeration simply keeps its colours.
        }
    }

    private static void CollectKeys(ResourceDictionary dictionary)
    {
        Collect(Fills, dictionary, "AccentFillColorDefaultBrush");
        Collect(Fills, dictionary, "AccentFillColorSelectedTextBackgroundBrush");
        Collect(Fills, dictionary, "SystemControlHighlightAccentBrush");
        Collect(Fills, dictionary, "SystemAccentColorBrush");
        Collect(Fills, dictionary, "MuffinAccentBrush");
        Collect(FillsSecondary, dictionary, "AccentFillColorSecondaryBrush");
        Collect(FillsTertiary, dictionary, "AccentFillColorTertiaryBrush");
        Collect(OnAccentPrimary, dictionary, "TextOnAccentFillColorPrimaryBrush");
        Collect(OnAccentPrimary, dictionary, "TextOnAccentFillColorSelectedTextBrush");
        Collect(OnAccentSecondary, dictionary, "TextOnAccentFillColorSecondaryBrush");
        Collect(AccentTexts, dictionary, "AccentTextFillColorPrimaryBrush");
        Collect(AccentTexts, dictionary, "AccentTextFillColorSecondaryBrush");
        Collect(AccentTexts, dictionary, "AccentTextFillColorTertiaryBrush");
        Collect(Tints, dictionary, "MuffinAccentTintBrush");
    }

    private static void Collect(List<SolidColorBrush> into, ResourceDictionary dictionary, string key)
    {
        try
        {
            if (dictionary.TryGetValue(key, out object? value) && value is SolidColorBrush brush && !into.Contains(brush))
            {
                into.Add(brush);
            }
        }
        catch
        {
        }
    }

    /// <summary>Repaints every accented control. Safe to call at any time.</summary>
    public static void Apply(string accentKey)
    {
        Color accent = ColorFor(accentKey);

        foreach (SolidColorBrush brush in Fills) brush.Color = accent;
        // WinUI's own convention for hover/pressed: same hue, less alpha.
        foreach (SolidColorBrush brush in FillsSecondary) brush.Color = WithAlpha(accent, 0.90);
        foreach (SolidColorBrush brush in FillsTertiary) brush.Color = WithAlpha(accent, 0.80);

        Color onAccent = Foreground(accent);
        foreach (SolidColorBrush brush in OnAccentPrimary) brush.Color = onAccent;
        foreach (SolidColorBrush brush in OnAccentSecondary) brush.Color = WithAlpha(onAccent, 0.75);

        // mobile theme.tintFill: the accent at low alpha, behind selected pills.
        foreach (SolidColorBrush brush in Tints) brush.Color = WithAlpha(accent, 0.15);

        // Accent-coloured TEXT (hyperlinks, the selected segment's label) uses
        // the accent as-is, exactly like mobile does with theme.tint.
        foreach (SolidColorBrush brush in AccentTexts) brush.Color = accent;

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

    /// <summary>The actual colour behind an accent key, System included.</summary>
    public static Color ColorFor(string accentKey) =>
        string.Equals(accentKey, "System", StringComparison.OrdinalIgnoreCase)
            ? WindowsAccent
            : ParseHex(HexFor(accentKey));

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
    public static Color Foreground(Color c)
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
