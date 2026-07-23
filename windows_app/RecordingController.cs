using System;
using System.IO;

namespace MuffinTranscriber;

/// <summary>
/// App-wide recording state, the desktop counterpart of the mobile app's
/// RecordingProvider.
///
/// Recording used to belong to the Record page, which meant it existed only
/// while you were looking at that page. Here it belongs to the app: the mic
/// button floats over every screen, and whatever screen you are on when you
/// stop, the finished audio is handed to the transcribe screen.
/// </summary>
public static class RecordingController
{
    private static MicrophoneRecorder? _recorder;
    private static string _currentPath = string.Empty;

    public static bool IsRecording => _recorder?.IsRecording == true;

    /// <summary>Fired when recording starts or stops, for the mic button's own state.</summary>
    public static event EventHandler? StateChanged;

    /// <summary>Elapsed time and mic level, ~33 times a second while recording.</summary>
    public static event EventHandler<(TimeSpan Time, float PeakLevel)>? Progress;

    /// <summary>A finished recording, with the path to its WAV. The shell listens
    /// for this and routes the file to the transcribe screen.</summary>
    public static event EventHandler<string>? RecordingFinished;

    public static bool HasMicrophone => NAudio.Wave.WaveInEvent.DeviceCount > 0;

    /// <summary>Starts recording. Returns false if the mic could not be opened.</summary>
    public static bool Start(out string error)
    {
        error = string.Empty;
        if (IsRecording) return true;

        if (!HasMicrophone)
        {
            error = AppStrings.Record_Status_NoMic;
            return false;
        }

        _currentPath = Path.Combine(AppModel.AudioCacheDir, $"record_{Guid.NewGuid():N}.wav");
        _recorder = new MicrophoneRecorder();
        _recorder.ProgressChanged += OnProgress;

        try
        {
            _recorder.Start(_currentPath);
        }
        catch (Exception ex)
        {
            error = string.Format(AppStrings.Record_Status_MicFailedFormat, ex.Message);
            _recorder.ProgressChanged -= OnProgress;
            _recorder.Dispose();
            _recorder = null;
            return false;
        }

        StateChanged?.Invoke(null, EventArgs.Empty);
        return true;
    }

    /// <summary>Stops recording and announces the finished file.</summary>
    public static void Stop()
    {
        if (_recorder is null) return;

        _recorder.ProgressChanged -= OnProgress;
        string path = _recorder.Stop();
        _recorder.Dispose();
        _recorder = null;

        StateChanged?.Invoke(null, EventArgs.Empty);

        // An empty file means the mic delivered nothing; nothing to transcribe.
        if (File.Exists(path) && new FileInfo(path).Length > 1024)
        {
            RecordingFinished?.Invoke(null, path);
        }
    }

    public static void Toggle()
    {
        if (IsRecording) Stop();
        else Start(out _);
    }

    private static void OnProgress(object? sender, (TimeSpan Time, float PeakLevel) data) =>
        Progress?.Invoke(null, data);
}
