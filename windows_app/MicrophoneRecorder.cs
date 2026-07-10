using NAudio.Wave;
using System;

namespace MuffinTranscriber;

public sealed class MicrophoneRecorder : IDisposable
{
    private WaveInEvent? _waveIn;
    private WaveFileWriter? _writer;
    private string _outputFilePath = string.Empty;

    // Guards _writer/_waveIn against the NAudio recording thread (DataAvailable)
    // racing with Stop()/Dispose() on the UI thread.
    private readonly object _sync = new();
    private volatile bool _isRecording;

    public event EventHandler<(TimeSpan Time, float PeakLevel)>? ProgressChanged;

    public bool IsRecording => _isRecording;

    public void Start(string outputFilePath)
    {
        lock (_sync)
        {
            if (_isRecording) return;

            _outputFilePath = outputFilePath;
            _waveIn = new WaveInEvent
            {
                WaveFormat = new WaveFormat(16000, 1), // Optimal format for Whisper
                BufferMilliseconds = 30,               // ~33 fps for a smooth visualizer
            };
            _writer = new WaveFileWriter(_outputFilePath, _waveIn.WaveFormat);
            _waveIn.DataAvailable += OnDataAvailable;
            _isRecording = true;
            _waveIn.StartRecording();
        }
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        lock (_sync)
        {
            // Stop() nulls these out before disposing the device, so a late
            // buffer delivered after Stop() is simply dropped instead of
            // writing to (or disposing) a finalized file.
            if (_writer is null || _waveIn is null) return;

            _writer.Write(e.Buffer, 0, e.BytesRecorded);

            float max = 0;
            for (int i = 0; i + 1 < e.BytesRecorded; i += 2)
            {
                short sample = (short)((e.Buffer[i + 1] << 8) | e.Buffer[i]);
                float val = Math.Abs(sample / 32768f);
                if (val > max) max = val;
            }

            var time = TimeSpan.FromSeconds((double)_writer.Length / _waveIn.WaveFormat.AverageBytesPerSecond);
            ProgressChanged?.Invoke(this, (time, max));
        }
    }

    /// <summary>
    /// Stops recording and finalizes the WAV file. When this returns, the file
    /// at the returned path is fully flushed and safe to read/transcode.
    /// </summary>
    public string Stop()
    {
        WaveInEvent? waveIn;
        lock (_sync)
        {
            if (!_isRecording) return _outputFilePath;
            _isRecording = false;

            // Detach the device from the writer first so no further buffers can
            // be written once we release the lock.
            waveIn = _waveIn;
            _waveIn = null;
        }

        // Dispose the device OUTSIDE the lock: WaveInEvent.Dispose() joins its
        // recording thread, which may be waiting on _sync inside OnDataAvailable.
        // Holding the lock here would deadlock.
        if (waveIn is not null)
        {
            waveIn.DataAvailable -= OnDataAvailable;
            try { waveIn.StopRecording(); } catch { }
            waveIn.Dispose();
        }

        lock (_sync)
        {
            _writer?.Dispose(); // finalizes the RIFF header / length fields
            _writer = null;
        }

        return _outputFilePath;
    }

    public void Dispose() => Stop();
}
