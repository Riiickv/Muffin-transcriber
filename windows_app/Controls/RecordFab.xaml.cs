using System;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace MuffinTranscriber.Controls;

/// <summary>
/// The floating mic button, the desktop twin of the mobile app's RecordFab: it
/// hovers over every screen so recording is always one click away, wears the
/// accent while idle, and turns a deliberate red with a running timer above it
/// while recording.
/// </summary>
public sealed partial class RecordFab : UserControl
{
    // A distinctly darker red than the danger accent, matching mobile, so
    // "recording" reads as a deliberate state rather than an error.
    private static readonly SolidColorBrush RecordingRed =
        new(Windows.UI.Color.FromArgb(255, 0xB3, 0x26, 0x1E));

    /// <summary>Raised when the mic could not be opened, so the shell can say why.</summary>
    public event EventHandler<string>? Failed;

    public RecordFab()
    {
        InitializeComponent();

        // Held in fields so they can be detached again: these are static events,
        // and a second window (the share mini-window can open one) would
        // otherwise leave the old button subscribed forever.
        _onStateChanged = (_, _) => DispatcherQueue.TryEnqueue(SyncState);
        _onProgress = (_, data) => DispatcherQueue.TryEnqueue(() =>
        {
            TimerText.Text = $"{(int)data.Time.TotalMinutes}:{data.Time.Seconds:00}";
        });

        RecordingController.StateChanged += _onStateChanged;
        RecordingController.Progress += _onProgress;
        Unloaded += (_, _) =>
        {
            RecordingController.StateChanged -= _onStateChanged;
            RecordingController.Progress -= _onProgress;
        };

        SyncState();
    }

    private readonly EventHandler _onStateChanged;
    private readonly EventHandler<(TimeSpan Time, float PeakLevel)> _onProgress;

    private void FabButton_Click(object sender, RoutedEventArgs e)
    {
        if (RecordingController.IsRecording)
        {
            RecordingController.Stop();
            return;
        }

        if (!RecordingController.Start(out string error))
        {
            Failed?.Invoke(this, error);
        }
    }

    private void SyncState()
    {
        bool recording = RecordingController.IsRecording;

        FabIcon.Glyph = recording ? "" : ""; // stop : mic
        TimerText.Visibility = recording ? Visibility.Visible : Visibility.Collapsed;
        TimerText.Text = "0:00";

        if (recording)
        {
            FabButton.Background = RecordingRed;
            FabIcon.Foreground = new SolidColorBrush(Colors.White);
        }
        else
        {
            // Clearing the local values hands the button back to the accent
            // style, so it follows the accent picker like everything else.
            FabButton.ClearValue(BackgroundProperty);
            FabIcon.ClearValue(ForegroundProperty);
        }

        ToolTipService.SetToolTip(FabButton, recording ? AppStrings.Record_StopButton : AppStrings.Record_StartButton);
        AutomationName(recording);
    }

    private void AutomationName(bool recording) =>
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(
            FabButton, recording ? AppStrings.Record_StopButton : AppStrings.Record_StartButton);
}
