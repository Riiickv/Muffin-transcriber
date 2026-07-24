using System;
using Microsoft.UI.Xaml;

namespace MuffinTranscriber.Pages;

// Wires an element to the live language switch: while it's loaded, a language
// change re-runs `update` (typically () => Bindings.Update()). Subscribing on
// Loaded and unsubscribing on Unloaded keeps cached pages from leaking or
// double-updating.
public static class LiveStrings
{
    public static void Attach(FrameworkElement element, Action update)
    {
        Action handler = () => element.DispatcherQueue.TryEnqueue(() => update());
        element.Loaded += (_, _) =>
        {
            LocalizationManager.LanguageChanged -= handler;
            LocalizationManager.LanguageChanged += handler;
        };
        element.Unloaded += (_, _) => LocalizationManager.LanguageChanged -= handler;
    }
}
