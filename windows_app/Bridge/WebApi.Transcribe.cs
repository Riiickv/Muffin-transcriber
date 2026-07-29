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
    /// <summary>
    /// Gives a fresh transcript a name that says what it is about, in at most
    /// three words, so a list of them can be read at a glance instead of being
    /// twenty rows of "Voice Memo".
    ///
    /// Deliberately not awaited by the caller: the transcript is saved and on
    /// screen the moment it exists, and the name arrives a few seconds later.
    /// A rename the user typed themselves is never overwritten, which is why
    /// the item is re-read here rather than trusting the copy passed in.
    /// </summary>
    private async Task NameTranscriptAsync(TranscriptionHistoryItem item, string text, string? formatterModel)
    {
        try
        {
            string? title = await LLMFormatter.GenerateTitleAsync(text, formatterModel);
            if (string.IsNullOrWhiteSpace(title)) return;

            TranscriptionHistoryItem? current = TranscriptionHistory.Load().FirstOrDefault(h => h.Id == item.Id);
            if (current is null || current.SourceFileName != item.SourceFileName) return;

            TranscriptionHistory.AddOrUpdate(current with { SourceFileName = title });
            Emit("history.changed", null);
        }
        catch (Exception ex)
        {
            // A transcript keeps its old name; nothing the user asked for failed.
            CrashLog.Write("Naming a transcript", ex);
        }
    }

    /// <summary>
    /// The id of the history row a queued file already owns. A recording gets
    /// its row before a single word is transcribed, so the run fills that row
    /// in instead of creating a second one at the end.
    /// </summary>
    private readonly Dictionary<string, string> _entryForFile = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Saves a finished recording and gives it a history row IMMEDIATELY, before
    /// any transcription is attempted, and returns the row's id.
    ///
    /// This is the whole safety net. Transcription can fail, the mic can turn
    /// out to have recorded silence, the machine can be shut down mid-run - and
    /// none of that may cost someone the two hours of audio they just captured.
    /// The row exists, the audio plays, and the words fill in afterwards. What
    /// happened before was the reverse: the recording lived in a temporary file
    /// until a transcription SUCCEEDED, so every failure path threw the audio
    /// away, and "no speech detected" threw it away without even an error.
    /// </summary>
    public async Task<string?> SaveRecordingAsync(string wavPath)
    {
        try
        {
            if (!File.Exists(wavPath)) return null;

            Directory.CreateDirectory(AppModel.AudioCacheDir);
            string kept = Path.Combine(AppModel.AudioCacheDir, Guid.NewGuid() + Path.GetExtension(wavPath));
            await Task.Run(() => File.Copy(wavPath, kept, true));

            string hash = await AppModel.ComputeFileHashAsync(kept);
            var item = new TranscriptionHistoryItem(
                Guid.NewGuid().ToString(),
                DateTime.Now,
                AppStrings.Record_VoiceMemoName,
                _settings.DefaultLanguage,
                string.Empty,
                null,
                null,
                kept,
                hash,
                null);

            TranscriptionHistory.AddOrUpdate(item);
            _entryForFile[kept] = item.Id;
            _recordedFiles.Add(kept);
            Emit("history.changed", null);
            return item.Id;
        }
        catch (Exception ex)
        {
            // The recording is still in its temporary file and the caller falls
            // back to the old path, so this is a lost row, not lost audio.
            CrashLog.Write("Saving a recording", ex);
            return null;
        }
    }

    /// <summary>The row a queued file already owns, if it has one.</summary>
    private TranscriptionHistoryItem? ExistingEntryFor(string file)
    {
        if (!_entryForFile.TryGetValue(file, out string? id)) return null;
        return TranscriptionHistory.Load().FirstOrDefault(h => h.Id == id);
    }

    /// <summary>
    /// Keeps audio that produced no words. A dropped file is unrecoverable; a
    /// row with no transcript can be re-transcribed, played, or exported, and
    /// it tells the user plainly that the recording itself was the problem.
    /// </summary>
    private void KeepSilentAudio(string file, string baseFileName, string fileHash, string cachedPath)
    {
        try
        {
            TranscriptionHistoryItem? existing = ExistingEntryFor(file);
            if (existing is not null)
            {
                // The row is already there and already points at the audio;
                // it simply stays empty.
                Emit("history.changed", null);
                return;
            }

            // A picked file lives wherever the user keeps it, so the cached copy
            // is what history should point at.
            string audio = File.Exists(cachedPath) ? cachedPath : file;
            TranscriptionHistory.AddOrUpdate(new TranscriptionHistoryItem(
                Guid.NewGuid().ToString(),
                DateTime.Now,
                baseFileName,
                _settings.DefaultLanguage,
                string.Empty,
                null,
                null,
                audio,
                fileHash,
                null));
            Emit("history.changed", null);
        }
        catch (Exception ex)
        {
            CrashLog.Write("Keeping silent audio", ex);
        }
    }

    /// <summary>
    /// Makes sure a file that failed mid-transcription is still in history with
    /// its audio, so it can be played and re-transcribed later. A recording
    /// already has its row; a picked file gets one now.
    /// </summary>
    private void KeepFailedAudio(string file)
    {
        try
        {
            if (ExistingEntryFor(file) is not null) { Emit("history.changed", null); return; }
            if (!File.Exists(file)) return;

            Directory.CreateDirectory(AppModel.AudioCacheDir);
            string kept = Path.Combine(AppModel.AudioCacheDir, Guid.NewGuid() + Path.GetExtension(file));
            File.Copy(file, kept, true);

            TranscriptionHistory.AddOrUpdate(new TranscriptionHistoryItem(
                Guid.NewGuid().ToString(),
                DateTime.Now,
                Path.GetFileName(file),
                _settings.DefaultLanguage,
                string.Empty,
                null,
                null,
                kept,
                null,
                null));
            Emit("history.changed", null);
        }
        catch (Exception ex)
        {
            CrashLog.Write("Keeping audio after a failure", ex);
        }
    }

    /// <summary>Queues the audio a recording already has a row for.</summary>
    public void TranscribeSavedRecording(string keptPath)
    {
        if (!File.Exists(keptPath)) return;
        _queuedFiles.Clear();
        _queuedFiles.Add(keptPath);
        EmitTranscribeState();
        if (_transcribeCts is null) _ = RunTranscriptionAsync();
    }

    /// <summary>The kept copy of a recording, by the row id it was given.</summary>
    public string? KeptPathFor(string entryId) =>
        _entryForFile.FirstOrDefault(pair => pair.Value == entryId).Key;

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

        // A duplicate says its own thing ("Loaded from history"); the closing
        // line must not paper over it with "Transcription complete".
        bool fromHistory = false;

        var whisperProgress = new Progress<int>(pct =>
        {
            _percent = pct;
            // The bar right below already says this, once per percent.
            SetStatus(string.Format(AppStrings.Home_Status_TranscribingPercentFormat, pct), "info", quiet: true);
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
                            fromHistory = true;
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
                        // No speech. The audio is NOT thrown away: a recording
                        // that came out silent is the one case where the user
                        // most needs the file kept, so they can play it and hear
                        // for themselves that the microphone was dead. Before
                        // this, a two hour lecture recorded off a muted input
                        // was deleted and the only trace was one red line.
                        KeepSilentAudio(file, baseFileName, fileHash, cachedPath);
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
                    string formatterModel = FormatterKey();

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
                        else
                        {
                            // Silence here used to read as "it just finished".
                            // If the formatter was asked for and produced
                            // nothing, say so.
                            SetStatus(AppStrings.History_Status_FormatFailed, "error");
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
                        else
                        {
                            int words = inputForSummary.Split([' ', '\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries).Length;
                            SetStatus(words < 15
                                ? AppStrings.History_Status_SummaryTooShort
                                : AppStrings.History_Status_SummaryFailed, "error");
                        }
                    }

                    // A recording already owns a row, created the moment it
                    // stopped. Fill that one in rather than leaving an empty
                    // row behind and adding a second one beside it.
                    TranscriptionHistoryItem? existing = ExistingEntryFor(file);
                    var saved = existing is not null
                        ? existing with
                        {
                            Language = lang,
                            RawTranscript = rawTranscript,
                            FormattedTranscript = formatted,
                            Summary = summary,
                            SrtTranscript = tr.Srt,
                        }
                        : new TranscriptionHistoryItem(
                            Guid.NewGuid().ToString(),
                            DateTime.Now,
                            baseFileName,
                            lang,
                            rawTranscript,
                            formatted,
                            summary,
                            cachedPath,
                            fileHash,
                            tr.Srt);
                    TranscriptionHistory.AddOrUpdate(saved);
                    Emit("history.changed", null);

                    _ = LLMFormatter.ExtractContextAsync(rawTranscript, formatterModel);
                    _ = NameTranscriptAsync(saved, formatted ?? rawTranscript, formatterModel);
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
                    // Whatever went wrong, the audio survives it. An engine that
                    // will not start, a model that will not load, a disk that
                    // filled up: none of them are a reason to lose the only copy
                    // of what someone recorded.
                    KeepFailedAudio(file);
                    continue;
                }
            }

            _queuedFiles.Clear();

            if (total == 1 && !fromHistory && _statusKind != "error")
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
            else if (total > 1)
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

    /// <summary>
    /// Nobody has to pick a formatter for formatting to work: an unset or
    /// uninstalled preference falls back to whatever IS installed, which is what
    /// the old picker did implicitly by selecting its first row.
    /// </summary>
    private ModelInfo? SelectedFormatterModel()
    {
        ModelInfo? preferred = AppModel.Resolve(AppModel.FormatterModels, _settings.PreferredFormatterModel);
        if (preferred is not null && AppModel.IsValidModelFile(AppModel.ModelPath(preferred.File))) return preferred;
        return AppModel.FormatterModels.FirstOrDefault(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File)));
    }

    private string FormatterKey() => SelectedFormatterModel()?.File ?? string.Empty;

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

    /// <summary>
    /// Says what is happening. The screen announces these, so they have to be
    /// worth announcing: pass quiet for the ones that only restate the progress
    /// bar, or a long transcription would fire one notification per percent.
    /// </summary>
    private void SetStatus(string message, string kind, bool quiet = false)
    {
        _status = message;
        _statusKind = kind;
        Emit("transcribe.status", new Dictionary<string, object?>
        {
            ["text"] = message,
            ["kind"] = kind,
            ["quiet"] = quiet,
        });
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
            ["whisperModels"] = AppModel.WhisperModels.Where(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File))).Select(m => ModelMap(m)).ToList(),
            ["formatterModels"] = AppModel.FormatterModels.Where(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File))).Select(m => ModelMap(m)).ToList(),
            ["selectedWhisper"] = whisper?.File ?? "",
            ["output"] = OutputMap(animate: false),
        };
    }
}
