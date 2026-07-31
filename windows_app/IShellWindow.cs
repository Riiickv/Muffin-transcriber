using System.Collections.Generic;

namespace MuffinTranscriber;

/// <summary>
/// What the page's title bar needs from whatever window is hosting it.
///
/// The window controls used to cast to MainWindow, so any other window got a
/// title bar whose buttons silently did nothing. The mini window is a page now
/// too, and it minimises, closes and drags like the main one.
/// </summary>
public interface IShellWindow
{
    void MinimizeWindow();
    void CloseWindow();
    bool ToggleMaximizeWindow();
    bool IsMaximized { get; }
    void SetDragRegions(IReadOnlyList<(double X, double Y, double W, double H)> rects);
}
