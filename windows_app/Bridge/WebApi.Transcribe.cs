using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Windows.Storage.Pickers;

namespace MuffinTranscriber.Web;

/// <summary>
/// The transcribe screen's pipeline: ffmpeg, whisper, then optionally the
/// formatter and the summary, saved to history at the end.
///
/// The job lives here rather than in the page because the screens are separate
/// documents. Wander off to Settings mid-transcription and the run keeps going;
/// come back and transcribe.state hands the screen everything it needs to draw
/// itself exactly as you left it.
/// </summary>
public sealed partial class WebBridge
{
    private readonly List<string> _queuedFiles = new();
    private readonly HashSet<string> _recordedFiles = new(StringComparer.OrdinalIgnoreCase);
    private CancellationTokenSource? _transcribeCts;

    private string _status = string.Empty;
    private string _statusKind = "info";
    private int _percent;
    private string _raw = string.Empty;
    private string _formatted = string.Empty;
    private string _summary = string.Empty;

    private void RegisterTranscribeHandlers()
    {
        Register("transcribe.state", _ => (object?)TranscribeStateMap());

        Register("transcribe.languages", _ => (object?)new Dictionary<string, object?>
        {
            ["transcription"] = WhisperLanguages.TranscriptionNames.ToList(),
            ["format"] = WhisperLanguages.FormatNames.ToList(),
        });

        Register("transcribe.pickFiles", async _ =>
        {
            var picker = new FileOpenPicker();
            WinRT.Interop.InitializeWithWindow.Initialize(
                picker, WinRT.Interop.WindowNative.GetWindowHandle(_window));

            foreach (string extension in AppModel.MediaExtensions)
            {
                picker.FileTypeFilter.Add(extension);
            }

            IReadOnlyList<Windows.Storage.StorageFile> files = await picker.PickMultipleFilesAsync();
            if (files.Count > 0) AddFiles(files.Select(f => f.Path).ToList());
            return TranscribeStateMap();
        });

        Register("transcribe.clearFiles", _ =>
        {
            _queuedFiles.Clear();
            EmitTranscribeState();
            return (object?)TranscribeStateMap();
        });

        Register("transcribe.start", async _ =>
        {
            await RunTranscriptionAsync();
            return TranscribeStateMap();
        });

        Register("transcribe.cancel", _ =>
        {
            _transcribeCts?.Cancel();
            return (object?)null;
        });
    }

    /// <summary>Files dropped on the window, handed over by the XAML host.</summary>
    public void AddFiles(List<string> paths)
    {
        int added = 0;
        foreach (string path in paths)
        {
            string extension = Path.GetExtension(path).ToLowerInvariant();
            if (File.Exists(path) && AppModel.MediaExtensions.Contains(extension) && !_queuedFiles.Contains(path))
            {
                _queuedFiles.Add(path);
                added++;
            }
        }

        if (added == 0)
        {
            if (_queuedFiles.Count == 0) SetStatus(AppStrings.Home_Status_InvalidFile, "error");
        }
        else if (_queuedFiles.Count == 1)
        {
            SetStatus(AppStrings.Home_Status_FileReady, "success");
        }
        else
        {
            SetStatus(string.Format(AppStrings.Home_Status_QueuedMultiple, _queuedFiles.Count), "success");
        }

        EmitTranscribeState();
    }

    /// <summary>
    /// A finished recording transcribes itself: pressing stop IS the intent, the
    /// same as on mobile.
    /// </summary>
    public void TranscribeRecording(string wavPath)
    {
        if (!File.Exists(wavPath)) return;

        _recordedFiles.Add(wavPath);
        _queuedFiles.Clear();
        _queuedFiles.Add(wavPath);
        EmitTranscribeState();

        if (_transcribeCts is null) _ = RunTranscriptionAsync();
    }

    private async Task RunTranscriptionAsync()
    {
        if (_transcribeCts is not null || _queuedFiles.Count == 0) return;

        ModelInfo? whisperModel = SelectedWhisperModel();
        if (whisperModel is null)
        {
            SetStatus(AppStrings.Common_NoModelInstalled, "error");
            EmitTranscribeState();
            return;
        }

        var filesToProcess = _queuedFiles.ToList();
        int total = filesToProcess.Count;
        int current = 0;

        _transcribeCts = new CancellationTokenSource();
        CancellationToken ct = _transcribeCts.Token;
        _percent = 0;
        EmitTranscribeState();

        var whisperProgress = new Progress<int>(pct =>
        {
            _percent = pct;
            SetStatus(string.Format(AppStrings.Home_Status_TranscribingPercentFormat, pct), "info");
            EmitTranscribeState();
        });

        try
        {
            foreach (string file in filesToProcess)
            {
                current++;
                string baseFileName = _recordedFiles.Contains(file)
                    ? AppStrings.Record_VoiceMemoName
                    : Path.GetFileName(file);

                if (total > 1)
                {
                    SetStatus(string.Format(AppStrings.Home_Status_BatchProgress, current, total, baseFileName), "info");
                }

                ResetOutput();
                string cachedPath = file;

                try
                {
                    if (total == 1) SetStatus(AppStrings.Home_Status_CheckingDuplicate, "info");
                    string fileHash = await AppModel.ComputeFileHashAsync(file);

                    if (!string.IsNullOrEmpty(fileHash))
                    {
                        TranscriptionHistoryItem? duplicate = TranscriptionHistory.Load()
                            .FirstOrDefault(i => i.FileHash == fileHash);

                        if (duplicate is not null)
                        {
                            _raw = duplicate.RawTranscript;
                            _formatted = duplicate.FormattedTranscript ?? string.Empty;
                            _summary = duplicate.Summary ?? string.Empty;
                            Emit("transcribe.output", OutputMap(animate: false));

                            if (total == 1)
                            {
                                if (_settings.AutoCopyTranscript)
                                {
                                    CopyText(ActiveText());
                                    SetStatus(AppStrings.Home_Status_LoadedFromHistoryCopied, "success");
                                }
                                else
                                {
                                    SetStatus(AppStrings.Home_Status_LoadedFromHistory, "success");
                                }
                            }

                            TranscriptionHistory.AddOrUpdate(duplicate);
                            EmitTranscribeState();
                            continue;
                        }
                    }

                    if (total == 1) SetStatus(AppStrings.Home_Status_CachingMedia, "info");
                    string ext = Path.GetExtension(file).ToLowerInvariant();
                    bool isVideo = ext is ".mp4" or ".mkv" or ".webm" or ".mov" or ".avi";
                    cachedPath = Path.Combine(isVideo ? AppModel.VideoCacheDir : AppModel.AudioCacheDir, Guid.NewGuid() + ext);

                    await Task.Run(() => File.Copy(file, cachedPath, true), ct);

                    if (total == 1) SetStatus(AppStrings.Home_Status_TranscribingWhisper, "info");
                    string lang = _settings.DefaultLanguage;
                    TranscriptionResult tr = await TranscriptionService.TranscribeAsync(
                        cachedPath, whisperModel, lang, _settings.NormalizeAudio, whisperProgress, ct);

                    if (string.IsNullOrWhiteSpace(tr.RawTranscript))
                    {
                        // No speech: warn and move on rather than saving a blob
                        // of engine noise to history.
                        SetStatus(string.Format(AppStrings.Home_Status_NoSpeechDetected, baseFileName), "error");
                        continue;
                    }

                    string rawTranscript = tr.RawTranscript;
                    _raw = rawTranscript;
                    // Only a single file types itself out; a batch would fight
                    // the reveal, so it just sets the text.
                    Emit("transcribe.output", OutputMap(animate: total == 1 && _settings.TypewriterEffect));

                    string? formatted = null;
                    string? summary = null;
                    string formatterModel = _settings.PreferredFormatterModel;

                    if (_settings.FormatByDefault)
                    {
                        if (total == 1) SetStatus(AppStrings.Home_Status_FormattingLLM, "info");
                        Action<string>? onPartial = total == 1
                            ? partial => { _formatted = partial; Emit("transcribe.partial", new Dictionary<string, object?> { ["tab"] = "formatted", ["text"] = partial }); }
                            : null;
                        formatted = await LLMFormatter.FormatTranscriptAsync(
                            rawTranscript, formatterModel, _settings.FormatLanguage,
                            _settings.CustomFormatSystemPrompt, ct, onPartial);
                        if (!string.IsNullOrWhiteSpace(formatted))
                        {
                            _formatted = formatted;
                            Emit("transcribe.output", OutputMap(animate: false));
                        }
                    }

                    if (_settings.SummarizeByDefault)
                    {
                        if (total == 1) SetStatus(AppStrings.Home_Status_SummarizingLLM, "info");
                        string inputForSummary = !string.IsNullOrWhiteSpace(formatted) ? formatted : rawTranscript;
                        summary = await LLMFormatter.SummarizeTranscriptAsync(
                            inputForSummary, formatterModel, _settings.FormatLanguage,
                            _settings.CustomSummarySystemPrompt, ct);
                        if (!string.IsNullOrWhiteSpace(summary))
                        {
                            _summary = summary;
                            Emit("transcribe.output", OutputMap(animate: false));
                        }
                    }

                    TranscriptionHistory.AddOrUpdate(new TranscriptionHistoryItem(
                        Guid.NewGuid().ToString(),
                        DateTime.Now,
                        baseFileName,
                        lang,
                        rawTranscript,
                        formatted,
                        summary,
                        cachedPath,
                        fileHash,
                        tr.Srt));

                    _ = LLMFormatter.ExtractContextAsync(rawTranscript, formatterModel);
                }
                catch (OperationCanceledException)
                {
                    SetStatus(AppStrings.Home_Status_Cancelled, "info");
                    break;
                }
                catch (Exception ex)
                {
                    // A missing engine or runtime has a story the user can act
                    // on; everything else keeps the raw details, plus a log.
                    CrashLog.Write("Web transcription", ex);
                    string? friendly = EngineHealth.FriendlyMessage(ex);
                    SetStatus(friendly ?? ex.Message, "error");
                    _raw = friendly ?? ex.Message;
                    Emit("transcribe.output", OutputMap(animate: false));
                    continue;
                }
            }

            _queuedFiles.Clear();

            if (total == 1)
            {
                if (_settings.AutoCopyTranscript && !string.IsNullOrEmpty(_raw))
                {
                    CopyText(ActiveText());
                    SetStatus(AppStrings.Home_Status_TranscriptionCompleteCopied, "success");
                }
                else if (!string.IsNullOrEmpty(_raw))
                {
                    SetStatus(AppStrings.Home_Status_TranscriptionComplete, "success");
                }
            }
            else
            {
                SetStatus(string.Format(AppStrings.Home_Status_BatchComplete, total), "success");
            }
        }
        finally
        {
            _transcribeCts?.Dispose();
            _transcribeCts = null;
            _percent = 0;
            EmitTranscribeState();
            Emit("transcribe.finished", null);
        }
    }

    private ModelInfo? SelectedWhisperModel() =>
        AppModel.WhisperModels.FirstOrDefault(m =>
            m.File == _settings.PreferredWhisperModel &&
            AppModel.IsValidModelFile(AppModel.ModelPath(m.File)))
        ?? AppModel.ActiveWhisperModel();

    private string ActiveText() =>
        !string.IsNullOrEmpty(_summary) ? _summary
        : !string.IsNullOrEmpty(_formatted) ? _formatted
        : _raw;

    private void ResetOutput()
    {
        _raw = string.Empty;
        _formatted = string.Empty;
        _summary = string.Empty;
        Emit("transcribe.output", OutputMap(animate: false));
    }

    private void SetStatus(string message, string kind)
    {
        _status = message;
        _statusKind = kind;
        Emit("transcribe.status", new Dictionary<string, object?> { ["text"] = message, ["kind"] = kind });
    }

    private static void CopyText(string text)
    {
        var package = new Windows.ApplicationModel.DataTransfer.DataPackage();
        package.SetText(text);
        Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
    }

    private Dictionary<string, object?> OutputMap(bool animate) => new()
    {
        ["raw"] = _raw,
        ["formatted"] = _formatted,
        ["summary"] = _summary,
        ["animate"] = animate,
        ["typewriterSpeed"] = _settings.TypewriterSpeed,
    };

    private void EmitTranscribeState() => Emit("transcribe.state", TranscribeStateMap());

    private Dictionary<string, object?> TranscribeStateMap()
    {
        ModelInfo? whisper = SelectedWhisperModel();
        return new Dictionary<string, object?>
        {
            ["running"] = _transcribeCts is not null,
            ["percent"] = _percent,
            ["status"] = _status,
            ["statusKind"] = _statusKind,
            ["files"] = _queuedFiles.Select(f => _recordedFiles.Contains(f) ? AppStrings.Record_VoiceMemoName : Path.GetFileName(f)).ToList(),
            ["canTranscribe"] = _queuedFiles.Count > 0 && whisper is not null,
            ["whisperModels"] = AppModel.WhisperModels.Where(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File))).Select(ModelMap).ToList(),
            ["formatterModels"] = AppModel.FormatterModels.Where(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File))).Select(ModelMap).ToList(),
            ["selectedWhisper"] = whisper?.File ?? "",
            ["output"] = OutputMap(animate: false),
        };
    }
}
