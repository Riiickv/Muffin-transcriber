using System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MuffinTranscriber.Pages;

namespace MuffinTranscriber.Controls;

// The transcript card shared by Home and Record: Raw/Formatted/Summary tabs, a
// copy button, and the text area. Before this, both pages carried a byte-for-
// byte copy of this XAML plus identical code-behind (three state fields, a
// SelectTab, three tab handlers, a clipboard helper). It also owns the two
// reveal behaviours: a typewriter for the raw transcript, and live updates as
// the formatter streams.
public sealed partial class TranscriptOutput : UserControl
{
    private enum Tab { Raw, Formatted, Summary }

    private string _raw = string.Empty;
    private string _formatted = string.Empty;
    private string _summary = string.Empty;
    private Tab _active = Tab.Raw;

    // Typewriter state for the raw transcript.
    private readonly DispatcherTimer _revealTimer = new() { Interval = TimeSpan.FromMilliseconds(20) };
    private string _revealTarget = string.Empty;
    private int _revealIndex;
    private int _revealPerTick = 3;

    // Raised after the user copies, so the host page can show its status toast.
    public event EventHandler? Copied;

    public TranscriptOutput()
    {
        InitializeComponent();
        _revealTimer.Tick += RevealTimer_Tick;
        MuffinTranscriber.Pages.LiveStrings.Attach(this, () => Bindings.Update());
    }

    // The full text of the visible tab (not the partially-revealed box), for
    // auto-copy and any "what is showing" check.
    public string FullText => _active switch
    {
        Tab.Formatted => _formatted,
        Tab.Summary => _summary,
        _ => _raw,
    };

    public void Reset()
    {
        StopReveal();
        _raw = _formatted = _summary = string.Empty;
        TranscriptBox.Text = string.Empty;
        SelectTab(Tab.Raw);
    }

    // Raw transcript. Types out when the typewriter setting is on; the format/
    // summarize steps that follow cancel the reveal cleanly.
    public void ShowRaw(string text, bool animate)
    {
        _raw = text ?? string.Empty;
        SelectTab(Tab.Raw);

        if (animate && UserSettings.Load().TypewriterEffect && _raw.Length > 0)
        {
            BeginReveal(_raw);
        }
        else
        {
            StopReveal();
            TranscriptBox.Text = _raw;
        }
    }

    // Formatted variant. Called repeatedly with growing text while the formatter
    // streams, then once more with the final text; each call switches to (and
    // stays on) the Formatted tab.
    public void ShowFormatted(string text)
    {
        StopReveal();
        _formatted = text ?? string.Empty;
        SelectTab(Tab.Formatted);
        TranscriptBox.Text = _formatted;
    }

    public void ShowSummary(string text)
    {
        StopReveal();
        _summary = text ?? string.Empty;
        SelectTab(Tab.Summary);
        TranscriptBox.Text = _summary;
    }

    // Load a completed history item: set every variant at once and show the
    // richest one available (summary > formatted > raw), matching the old
    // per-page logic.
    public void LoadAll(string raw, string? formatted, string? summary)
    {
        StopReveal();
        _raw = raw ?? string.Empty;
        _formatted = formatted ?? string.Empty;
        _summary = summary ?? string.Empty;

        if (_summary.Length > 0) SelectTab(Tab.Summary);
        else if (_formatted.Length > 0) SelectTab(Tab.Formatted);
        else SelectTab(Tab.Raw);

        TranscriptBox.Text = FullText;
    }

    private void BeginReveal(string target)
    {
        _revealTarget = target;
        _revealIndex = 0;
        _revealPerTick = SpeedPerTick(UserSettings.Load().TypewriterSpeed, target.Length);
        TranscriptBox.Text = string.Empty;
        _revealTimer.Start();
    }

    private void StopReveal()
    {
        if (_revealTimer.IsEnabled) _revealTimer.Stop();
        // If a reveal was mid-way, snap the box to the whole target so nothing
        // is ever left truncated.
        if (_revealTarget.Length > 0 && _revealIndex < _revealTarget.Length)
        {
            TranscriptBox.Text = _revealTarget;
        }
        _revealTarget = string.Empty;
        _revealIndex = 0;
    }

    private void RevealTimer_Tick(object? sender, object e)
    {
        _revealIndex = Math.Min(_revealTarget.Length, _revealIndex + _revealPerTick);
        TranscriptBox.Text = _revealTarget[.._revealIndex];
        TranscriptBox.Select(TranscriptBox.Text.Length, 0); // keep the caret trailing

        if (_revealIndex >= _revealTarget.Length)
        {
            _revealTimer.Stop();
            _revealTarget = string.Empty;
            _revealIndex = 0;
        }
    }

    // Reveal in ~20ms ticks. Base speed per step, scaled up so even a long
    // transcript finishes in a few seconds rather than crawling.
    private static int SpeedPerTick(string speed, int length)
    {
        int baseChars = speed switch
        {
            "Slow" => 1,
            "Fast" => 9,
            _ => 3,
        };
        return Math.Max(baseChars, (int)Math.Ceiling(length / 240.0));
    }

    private void TabRawButton_Click(object sender, RoutedEventArgs e) => SwitchTo(Tab.Raw);
    private void TabFormattedButton_Click(object sender, RoutedEventArgs e) => SwitchTo(Tab.Formatted);
    private void TabSummaryButton_Click(object sender, RoutedEventArgs e) => SwitchTo(Tab.Summary);

    private void SwitchTo(Tab tab)
    {
        StopReveal();
        SelectTab(tab);
        TranscriptBox.Text = FullText;
    }

    private void SelectTab(Tab tab)
    {
        _active = tab;
        var accent = (Style)Application.Current.Resources["AccentButtonStyle"];
        var normal = (Style)Application.Current.Resources["DefaultButtonStyle"];
        TabRawButton.Style = tab == Tab.Raw ? accent : normal;
        TabFormattedButton.Style = tab == Tab.Formatted ? accent : normal;
        TabSummaryButton.Style = tab == Tab.Summary ? accent : normal;
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        UiHelpers.CopyToClipboard(TranscriptBox.Text);
        Copied?.Invoke(this, EventArgs.Empty);
    }
}
