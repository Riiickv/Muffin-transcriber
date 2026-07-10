using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace MuffinTranscriber;

public static class ThemeHelper
{
    public static readonly string[] Modes = ["System", "Light", "Dark", "AMOLED"];

    // Applies the theme to a window's content. AMOLED is Dark with the Mica
    // backdrop swapped for solid black.
    public static void Apply(Window? window, string mode)
    {
        if (window?.Content is not FrameworkElement root) return;

        switch (mode)
        {
            case "Light":
                root.RequestedTheme = ElementTheme.Light;
                SetBlackBackground(window, root, false);
                break;
            case "Dark":
                root.RequestedTheme = ElementTheme.Dark;
                SetBlackBackground(window, root, false);
                break;
            case "AMOLED":
                root.RequestedTheme = ElementTheme.Dark;
                SetBlackBackground(window, root, true);
                break;
            default:
                root.RequestedTheme = ElementTheme.Default;
                SetBlackBackground(window, root, false);
                break;
        }
    }

    private static void SetBlackBackground(Window window, FrameworkElement root, bool black)
    {
        if (black)
        {
            window.SystemBackdrop = null;
            if (root is Panel panel) panel.Background = new SolidColorBrush(Colors.Black);
        }
        else
        {
            window.SystemBackdrop = new MicaBackdrop();
            if (root is Panel panel) panel.Background = null;
        }
    }
}
