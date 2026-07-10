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

    private string _currentRawTranscript = string.Empty;
    private string _currentFormattedTranscript = string.Empty;
    private string _currentSummary = string.Empty;

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
            WhisperModelBox.PlaceholderText = "No model installed";
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
        e.DragUIOverride.Caption = "Drop to transcribe";
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
        if (_queuedFiles.Count == 0 || _selectedWhisperModel is null)
        {
            return;
        }

        var filesToProcess = _queuedFiles.ToList();
        int total = filesToProcess.Count;
        int current = 0;

        TranscribeButton.IsEnabled = false;
        FileButton.IsEnabled = false;
        BusyRing.IsActive = true;
        
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
                
                TranscriptBox.Text = string.Empty;
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
                            _currentRawTranscript = duplicate.RawTranscript;
                            _currentFormattedTranscript = duplicate.FormattedTranscript ?? string.Empty;
                            _currentSummary = duplicate.Summary ?? string.Empty;

                            SelectTab(TabRawButton);
                            TranscriptBox.Text = _currentRawTranscript;
                            
                            if (!string.IsNullOrEmpty(_currentFormattedTranscript)) SelectTab(TabFormattedButton);
                            if (!string.IsNullOrEmpty(_currentSummary)) SelectTab(TabSummaryButton);
                            
                            TranscriptBox.Text = string.IsNullOrEmpty(_currentSummary) 
                                ? (string.IsNullOrEmpty(_currentFormattedTranscript) ? _currentRawTranscript : _currentFormattedTranscript) 
                                : _currentSummary;
                            
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
                    TranscriptionResult tr = await TranscriptionService.TranscribeAsync(cachedPath, _selectedWhisperModel, lang, _settings.NormalizeAudio);

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
                    
                    _currentRawTranscript = rawTranscript;
                    _currentFormattedTranscript = string.Empty;
                    _currentSummary = string.Empty;
                    
                    SelectTab(TabRawButton);
                    TranscriptBox.Text = _currentRawTranscript;

                    if (FormatSwitch.IsOn)
                    {
                        if (total == 1) ShowStatus(AppStrings.Home_Status_FormattingLLM, InfoBarSeverity.Informational);
                        formatted = await LLMFormatter.FormatTranscriptAsync(rawTranscript, SelectedComboText(FormatterModelBox), SelectedComboText(FormatLanguageBox));
                        if (!string.IsNullOrWhiteSpace(formatted))
                        {
                            _currentFormattedTranscript = formatted;
                            SelectTab(TabFormattedButton);
                            TranscriptBox.Text = _currentFormattedTranscript;
                        }
                    }
                    
                    if (SummarizeSwitch.IsOn)
                    {
                        if (total == 1) ShowStatus(AppStrings.Home_Status_SummarizingLLM, InfoBarSeverity.Informational);
                        string inputForSummary = !string.IsNullOrWhiteSpace(formatted) ? formatted : rawTranscript;
                        summary = await LLMFormatter.SummarizeTranscriptAsync(inputForSummary, SelectedComboText(FormatterModelBox), SelectedComboText(FormatLanguageBox));
                        if (!string.IsNullOrWhiteSpace(summary))
                        {
                            _currentSummary = summary;
                            SelectTab(TabSummaryButton);
                            TranscriptBox.Text = _currentSummary;
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
                catch (Exception ex)
                {
                    ShowStatus(ex.Message, InfoBarSeverity.Error);
                    TranscriptBox.Text = ex.ToString();
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
            BusyRing.IsActive = false;
            FileButton.IsEnabled = true;
            UpdateTranscribeState();
        }
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        CopyTranscriptToClipboard();
        ShowStatus(AppStrings.Home_Status_CopiedToClipboard, InfoBarSeverity.Success);
    }

    private void CopyTranscriptToClipboard() => UiHelpers.CopyToClipboard(TranscriptBox.Text);

    private void TabRawButton_Click(object sender, RoutedEventArgs e)
    {
        SelectTab(TabRawButton);
        TranscriptBox.Text = _currentRawTranscript;
    }

    private void TabFormattedButton_Click(object sender, RoutedEventArgs e)
    {
        SelectTab(TabFormattedButton);
        TranscriptBox.Text = _currentFormattedTranscript;
    }

    private void TabSummaryButton_Click(object sender, RoutedEventArgs e)
    {
        SelectTab(TabSummaryButton);
        TranscriptBox.Text = _currentSummary;
    }

    private void SelectTab(Button selectedButton)
    {
        TabRawButton.Style = (Style)Application.Current.Resources["DefaultButtonStyle"];
        TabFormattedButton.Style = (Style)Application.Current.Resources["DefaultButtonStyle"];
        TabSummaryButton.Style = (Style)Application.Current.Resources["DefaultButtonStyle"];
        selectedButton.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
    }

    private void ShowStatus(string message, InfoBarSeverity severity) => _status.Show(message, severity);

    private static string SelectedComboText(ComboBox box) => UiHelpers.SelectedComboText(box);

    private static void SelectComboItem(ComboBox box, string value) => UiHelpers.SelectComboItem(box, value);

}
