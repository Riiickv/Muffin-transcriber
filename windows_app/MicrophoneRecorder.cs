using NAudio.Wave;
using System;
using System.IO;

namespace MuffinTranscriber;

public sealed class MicrophoneRecorder : IDisposable
{
    private WaveInEvent? _waveIn;
    private WaveFileWriter? _writer;
    private string _outputFilePath = string.Empty;

    public event EventHandler<(TimeSpan Time, float PeakLevel)>? ProgressChanged;

    public bool IsRecording => _waveIn != null;

    public void Start(string outputFilePath)
    {
        if (IsRecording) return;

        _outputFilePath = outputFilePath;
        _waveIn = new WaveInEvent
        {
            WaveFormat = new WaveFormat(16000, 1), // Optimal format for Whisper
            BufferMilliseconds = 30 // Increased framerate (33fps) for smooth visualizer
        };

        _writer = new WaveFileWriter(_outputFilePath, _waveIn.WaveFormat);

        _waveIn.DataAvailable += (s, e) =>
        {
            if (_writer == null) return;
            
            _writer.Write(e.Buffer, 0, e.BytesRecorded);
            
            float max = 0;
            for (int i = 0; i < e.BytesRecorded; i += 2)
            {
                short sample = (short)((e.Buffer[i + 1] << 8) | e.Buffer[i]);
                var val = sample / 32768f;
                if (val < 0) val = -val;
                if (val > max) max = val;
            }
            
            if (_waveIn != null)
            {
                var time = TimeSpan.FromSeconds((double)_writer.Length / _waveIn.WaveFormat.AverageBytesPerSecond);
                ProgressChanged?.Invoke(this, (time, max));
            }
        };

        _waveIn.RecordingStopped += (s, e) =>
        {
            _writer?.Dispose();
            _writer = null;
            _waveIn?.Dispose();
            _waveIn = null;
        };

        _waveIn.StartRecording();
    }

    public string Stop()
    {
        if (!IsRecording) return _outputFilePath;
        _waveIn?.StopRecording();
        return _outputFilePath;
    }

    public void Dispose()
    {
        if (_waveIn != null)
        {
            _waveIn.StopRecording();
            _writer?.Dispose();
            _writer = null;
            _waveIn.Dispose();
            _waveIn = null;
        }
    }
}
