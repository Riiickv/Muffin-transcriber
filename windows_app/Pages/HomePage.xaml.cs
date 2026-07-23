using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Pickers;

namespace MuffinTranscriber.Pages;

public sealed partial class HomePage : Page
{
    private List<string> _queuedFiles = new();
    private ModelInfo? _selectedWhisperModel;
    private UserSettings _settings = new();

    // Non-null while a run is active; the Transcribe button becomes Cancel.
    private CancellationTokenSource? _transcribeCts;

    private readonly StatusBarController _status;

    public HomePage()
    {
        InitializeComponent();
        _settings = UserSettings.Load();

        _status = new StatusBarController(StatusBar);

        LoadModels();
        FileButton.AllowDrop = true;
        FileButton.DragOver += FileButton_DragOver;
        FileButton.Drop += FileButton_Drop;
        Output.Copied += (_, _) => ShowStatus(AppStrings.Home_Status_CopiedToClipboard, InfoBarSeverity.Success);
    }

    public async void ProcessShareOperation(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation shareOperation)
    {
        try
        {
            shareOperation.ReportStarted();
            if (!shareOperation.Data.Contains(StandardDataFormats.StorageItems))
            {
                Debug.WriteLine("HomePage share: no StorageItems on the data package");
                return;
            }

            IReadOnlyList<Windows.Storage.IStorageItem> items = await shareOperation.Data.GetStorageItemsAsync();
            List<string> shareFiles = new();
            string tempDir = Path.GetTempPath();
            Windows.Storage.StorageFolder folder = await Windows.Storage.StorageFolder.GetFolderFromPathAsync(tempDir);

            foreach (var fileItem in items.OfType<Windows.Storage.StorageFile>())
            {
                var copiedFile = await fileItem.CopyAsync(folder, fileItem.Name, Windows.Storage.NameCollisionOption.GenerateUniqueName);
                shareFiles.Add(copiedFile.Path);
            }

            if (shareFiles.Count > 0)
            {
                AddSelectedFiles(shareFiles);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"HomePage share error: {ex}");
        }
    }

    private void LoadModels()
    {
        Directory.CreateDirectory(AppModel.ModelsDir);
        _settings = UserSettings.Load();
        LanguageBox.ItemsSource = WhisperLanguages.TranscriptionNames;
        FormatLanguageBox.ItemsSource = WhisperLanguages.FormatNames;
        SelectComboItem(LanguageBox, _settings.DefaultLanguage);
        FormatSwitch.IsOn = _settings.FormatByDefault;
        SelectComboItem(FormatLanguageBox, _settings.FormatLanguage);
        HomeCustomFormatBox.Text = _settings.CustomFormatSystemPrompt;
        
        SummarizeSwitch.IsOn = _settings.SummarizeByDefault;

        WhisperModelBox.Items.Clear();
        foreach (ModelInfo model in AppModel.WhisperModels.Where(model => AppModel.IsValidModelFile(AppModel.ModelPath(model.File))))
        {
            WhisperModelBox.Items.Add(AppModel.CompactName(model));
        }

        _selectedWhisperModel = AppModel.WhisperModels.FirstOrDefault(model =>
            model.File == _settings.PreferredWhisperModel &&
            AppModel.IsValidModelFile(AppModel.ModelPath(model.File))) ?? AppModel.ActiveWhisperModel();

        if (_selectedWhisperModel is not null)
        {
            WhisperModelBox.SelectedItem = AppModel.CompactName(_selectedWhisperModel);
        }
        else
        {
            WhisperModelBox.PlaceholderText = AppStrings.Common_NoModelInstalled;
        }

        FormatterModelBox.Items.Clear();
        foreach (ModelInfo model in AppModel.FormatterModels.Where(model => AppModel.IsValidModelFile(AppModel.ModelPath(model.File))))
        {
            FormatterModelBox.Items.Add(model.Name);
        }

        if (FormatterModelBox.Items.Count > 0)
        {
            if (FormatterModelBox.Items.Contains(_settings.PreferredFormatterModel))
            {
                FormatterModelBox.SelectedItem = _settings.PreferredFormatterModel;
            }
            else
            {
                FormatterModelBox.SelectedIndex = 0;
            }
        }
        else
        {
            FormatterModelBox.PlaceholderText = AppStrings.Home_Status_NoFormatter;
            FormatSwitch.IsEnabled = false;
            SummarizeSwitch.IsEnabled = false;
            FormatterModelBox.IsEnabled = false;
        }

        LanguageBox.SelectionChanged += (s, e) =>
        {
            _settings.DefaultLanguage = SelectedComboText(LanguageBox);
            _settings.Save();
        };

        FormatLanguageBox.SelectionChanged += (s, e) =>
        {
            _settings.FormatLanguage = SelectedComboText(FormatLanguageBox);
            _settings.Save();
        };

        FormatSwitch.Toggled += (s, e) =>
        {
            _settings.FormatByDefault = FormatSwitch.IsOn;
            _settings.Save();
        };
        
        SummarizeSwitch.Toggled += (s, e) =>
        {
            _settings.SummarizeByDefault = SummarizeSwitch.IsOn;
            _settings.Save();
        };

        FormatterModelBox.SelectionChanged += (s, e) =>
        {
            if (FormatterModelBox.SelectedItem is string selection)
            {
                _settings.PreferredFormatterModel = selection;
                _settings.Save();
            }
        };

        UpdateTranscribeState();
    }

    private void HomeCustomFormatBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        _settings.CustomFormatSystemPrompt = HomeCustomFormatBox.Text;
        _settings.Save();
    }

    private void WhisperModelBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (WhisperModelBox.SelectedItem is string selected)
        {
            _selectedWhisperModel = AppModel.WhisperModels.FirstOrDefault(model => AppModel.CompactName(model) == selected);
        }

        UpdateTranscribeState();
    }

    private async void FileButton_Click(object sender, RoutedEventArgs e)
    {
        FileOpenPicker picker = new();
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow));

        foreach (string extension in AppModel.MediaExtensions)
        {
            picker.FileTypeFilter.Add(extension);
        }

        IReadOnlyList<Windows.Storage.StorageFile> files = await picker.PickMultipleFilesAsync();
        if (files.Count > 0)
        {
            AddSelectedFiles(files.Select(f => f.Path).ToList());
        }
    }

    private void FileButton_DragOver(object sender, DragEventArgs e)
    {
        e.AcceptedOperation = DataPackageOperation.Copy;
        e.DragUIOverride.Caption = AppStrings.Home_DropCaption;
        e.DragUIOverride.IsContentVisible = true;
    }

    private async void FileButton_Drop(object sender, DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems))
        {
            return;
        }

        IReadOnlyList<Windows.Storage.IStorageItem> items = await e.DataView.GetStorageItemsAsync();
        var validFiles = new List<string>();
        foreach (var item in items.OfType<Windows.Storage.StorageFile>())
        {
            validFiles.Add(item.Path);
        }
        
        if (validFiles.Count > 0)
        {
            AddSelectedFiles(validFiles);
        }
    }

    private void AddSelectedFiles(List<string> paths)
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
            if (_queuedFiles.Count == 0) ShowStatus(AppStrings.Home_Status_InvalidFile, InfoBarSeverity.Error);
            return;
        }

        if (_queuedFiles.Count == 1)
        {
            FileButton.Content = Path.GetFileName(_queuedFiles[0]);
            ShowStatus(AppStrings.Home_Status_FileReady, InfoBarSeverity.Success);
        }
        else
        {
            FileButton.Content = string.Format(AppStrings.Home_Status_QueuedMultiple, _queuedFiles.Count);
            ShowStatus(string.Format(AppStrings.Home_Status_QueuedMultiple, _queuedFiles.Count), InfoBarSeverity.Success);
        }
        
        UpdateTranscribeState();
    }

    private void UpdateTranscribeState()
    {
        TranscribeButton.IsEnabled = _queuedFiles.Count > 0 && _selectedWhisperModel is not null;
    }

    private async void TranscribeButton_Click(object sender, RoutedEventArgs e)
    {
        // While running, this button is the cancel button.
        if (_transcribeCts is not null)
        {
            _transcribeCts.Cancel();
            return;
        }

        if (_queuedFiles.Count == 0 || _selectedWhisperModel is null)
        {
            return;
        }

        var filesToProcess = _queuedFiles.ToList();
        int total = filesToProcess.Count;
        int current = 0;

        _transcribeCts = new CancellationTokenSource();
        CancellationToken ct = _transcribeCts.Token;
        TranscribeButton.Content = AppStrings.Home_CancelButton;
        FileButton.IsEnabled = false;
        BusyRing.IsActive = true;

        var whisperProgress = new Progress<int>(pct =>
            ShowStatus(string.Format(AppStrings.Home_Status_TranscribingPercentFormat, pct), InfoBarSeverity.Informational));

        try
        {
            foreach (string file in filesToProcess)
            {
                current++;
                string baseFileName = Path.GetFileName(file);
                
                if (total > 1)
                {
                    ShowStatus(string.Format(AppStrings.Home_Status_BatchProgress, current, total, baseFileName), InfoBarSeverity.Informational);
                }
                
                Output.Reset();
                string cachedPath = file;

                try
                {
                    if (total == 1) ShowStatus(AppStrings.Home_Status_CheckingDuplicate, InfoBarSeverity.Informational);
                    string fileHash = await AppModel.ComputeFileHashAsync(file);
                    
                    if (!string.IsNullOrEmpty(fileHash))
                    {
                        var existingHistory = TranscriptionHistory.Load();
                        var duplicate = existingHistory.FirstOrDefault(i => i.FileHash == fileHash);
                        
                        if (duplicate != null)
                        {
                            Output.LoadAll(duplicate.RawTranscript, duplicate.FormattedTranscript, duplicate.Summary);

                            if (total == 1)
                            {
                                if (_settings.AutoCopyTranscript)
                                {
                                    CopyTranscriptToClipboard();
                                    ShowStatus(AppStrings.Home_Status_LoadedFromHistoryCopied, InfoBarSeverity.Success);
                                }
                                else
                                {
                                    ShowStatus(AppStrings.Home_Status_LoadedFromHistory, InfoBarSeverity.Success);
                                }
                            }

                            TranscriptionHistory.AddOrUpdate(duplicate);
                            continue;
                        }
                    }

                    if (total == 1) ShowStatus(AppStrings.Home_Status_CachingMedia, InfoBarSeverity.Informational);
                    string ext = Path.GetExtension(file).ToLowerInvariant();
                    bool isVideo = ext == ".mp4" || ext == ".mkv" || ext == ".webm" || ext == ".mov" || ext == ".avi";
                    cachedPath = Path.Combine(isVideo ? AppModel.VideoCacheDir : AppModel.AudioCacheDir, Guid.NewGuid().ToString() + ext);
                    
                    await Task.Run(() => File.Copy(file, cachedPath, true));

                    if (total == 1) ShowStatus(AppStrings.Home_Status_TranscribingWhisper, InfoBarSeverity.Informational);
                    string lang = SelectedComboText(LanguageBox);
                    TranscriptionResult tr = await TranscriptionService.TranscribeAsync(cachedPath, _selectedWhisperModel, lang, _settings.NormalizeAudio, whisperProgress, ct);

                    string rawTranscript = tr.RawTranscript;
                    if (string.IsNullOrWhiteSpace(rawTranscript))
                    {
                        // No speech: don't persist a debug blob to history, just warn and skip.
                        Debug.WriteLine($"Whisper produced no output for {baseFileName}. ExitCode={tr.WhisperExitCode}. Stderr:\n{tr.WhisperStderr}");
                        ShowStatus(string.Format(AppStrings.Home_Status_NoSpeechDetected, baseFileName), InfoBarSeverity.Error);
                        continue;
                    }

                    string? srtTranscript = tr.Srt;

                    string? formatted = null;
                    string? summary = null;

                    // Only the single-file case types out live; a batch would
                    // fight the reveal, so it just sets the text.
                    Output.ShowRaw(rawTranscript, animate: total == 1);

                    if (FormatSwitch.IsOn)
                    {
                        if (total == 1) ShowStatus(AppStrings.Home_Status_FormattingLLM, InfoBarSeverity.Informational);
                        Action<string>? onPartial = total == 1 ? p => Output.ShowFormatted(p) : null;
                        formatted = await LLMFormatter.FormatTranscriptAsync(rawTranscript, SelectedComboText(FormatterModelBox), SelectedComboText(FormatLanguageBox), ct: ct, onPartial: onPartial);
                        if (!string.IsNullOrWhiteSpace(formatted))
                        {
                            Output.ShowFormatted(formatted);
                        }
                    }

                    if (SummarizeSwitch.IsOn)
                    {
                        if (total == 1) ShowStatus(AppStrings.Home_Status_SummarizingLLM, InfoBarSeverity.Informational);
                        string inputForSummary = !string.IsNullOrWhiteSpace(formatted) ? formatted : rawTranscript;
                        summary = await LLMFormatter.SummarizeTranscriptAsync(inputForSummary, SelectedComboText(FormatterModelBox), SelectedComboText(FormatLanguageBox), ct: ct);
                        if (!string.IsNullOrWhiteSpace(summary))
                        {
                            Output.ShowSummary(summary);
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
                        srtTranscript
                    ));

                    _ = LLMFormatter.ExtractContextAsync(rawTranscript, SelectedComboText(FormatterModelBox));
                }
                catch (OperationCanceledException)
                {
                    ShowStatus(AppStrings.Home_Status_Cancelled, InfoBarSeverity.Informational);
                    break;
                }
                catch (Exception ex)
                {
                    // A missing engine or runtime has a story the user can act
                    // on; everything else keeps the raw details, plus a log.
                    CrashLog.Write("HomePage transcription", ex);
                    string? friendly = EngineHealth.FriendlyMessage(ex);
                    ShowStatus(friendly ?? ex.Message, InfoBarSeverity.Error);
                    Output.ShowRaw(friendly ?? ex.ToString(), animate: false);
                    continue;
                }
            }

            _queuedFiles.Clear();
            FileButton.Content = AppStrings.Home_DropZoneText;
            
            if (total == 1)
            {
                if (_settings.AutoCopyTranscript)
                {
                    CopyTranscriptToClipboard();
                    ShowStatus(AppStrings.Home_Status_TranscriptionCompleteCopied, InfoBarSeverity.Success);
                }
                else
                {
                    ShowStatus(AppStrings.Home_Status_TranscriptionComplete, InfoBarSeverity.Success);
                }
            }
            else
            {
                ShowStatus(string.Format(AppStrings.Home_Status_BatchComplete, total), InfoBarSeverity.Success);
            }
        }
        finally
        {
            _transcribeCts.Dispose();
            _transcribeCts = null;
            TranscribeButton.Content = AppStrings.Home_TranscribeButton;
            BusyRing.IsActive = false;
            FileButton.IsEnabled = true;
            UpdateTranscribeState();
        }
    }

    // Auto-copy uses the full active variant, not the box (which may be
    // mid-typewriter).
    private void CopyTranscriptToClipboard() => UiHelpers.CopyToClipboard(Output.FullText);

    private void ShowStatus(string message, InfoBarSeverity severity) => _status.Show(message, severity);

    private static string SelectedComboText(ComboBox box) => UiHelpers.SelectedComboText(box);

    private static void SelectComboItem(ComboBox box, string value) => UiHelpers.SelectComboItem(box, value);

}
