using System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;

namespace MuffinTranscriber.Pages;

// Small helpers extracted from what was copy-pasted across the pages.
public static class UiHelpers
{
    public static string SelectedComboText(ComboBox box) =>
        (box.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? box.SelectedItem?.ToString() ?? string.Empty;

    public static void SelectComboItem(ComboBox box, string value, bool fallbackToFirst = false)
    {
        foreach (object item in box.Items)
        {
            if ((item as ComboBoxItem)?.Content?.ToString() == value || item?.ToString() == value)
            {
                box.SelectedItem = item;
                return;
            }
        }

        if (fallbackToFirst && box.Items.Count > 0)
        {
            box.SelectedIndex = 0;
        }
    }

    public static void CopyToClipboard(string text)
    {
        var package = new DataPackage();
        package.SetText(text ?? string.Empty);
        Clipboard.SetContent(package);
    }
}

// Wraps an InfoBar with the 3-second auto-dismiss timer every page reimplemented.
public sealed class StatusBarController
{
    private readonly InfoBar _bar;
    private readonly DispatcherTimer _timer;

    public StatusBarController(InfoBar bar)
    {
        _bar = bar;
        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _timer.Tick += (s, e) => { _bar.IsOpen = false; _timer.Stop(); };
    }

    public void Show(string message, InfoBarSeverity severity)
    {
        _bar.Message = message;
        _bar.Severity = severity;
        _bar.IsOpen = true;

        if (severity is InfoBarSeverity.Success or InfoBarSeverity.Error)
        {
            _timer.Stop();
            _timer.Start();
        }
        else
        {
            _timer.Stop();
        }
    }
}
