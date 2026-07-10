using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using Windows.ApplicationModel.DataTransfer;
using Windows.Media.Core;

namespace MuffinTranscriber.Pages;

public sealed partial class HistoryPage : Page
{
    private TranscriptionHistoryItem? _selectedItem;

    private readonly StatusBarController _status;

    public HistoryPage()
    {
        InitializeComponent();

        _status = new StatusBarController(StatusBar);

        LoadModels();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var settings = UserSettings.Load();
        if (settings.HistoryListWidth >= 100)
        {
            ListColumn.Width = new GridLength(settings.HistoryListWidth);
        }
        LoadHistory();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        AudioPlayer.MediaPlayer?.Pause();
        var settings = UserSettings.Load();
        settings.HistoryListWidth = ListColumn.Width.Value;
        settings.Save();
    }

    private void LoadModels()
    {
        FormatLanguageBox.ItemsSource = WhisperLanguages.FormatNames;
        FormatLanguageBox.SelectedIndex = 0;

        LLMModelBox.Items.Clear();
        foreach (ModelInfo model in AppModel.FormatterModels.Where(model => AppModel.IsValidModelFile(AppModel.ModelPath(model.File))))
        {
            LLMModelBox.Items.Add(model.Name);
        }

        HistoryWhisperModelBox.Items.Clear();
        foreach (ModelInfo model in AppModel.WhisperModels.Where(model => AppModel.IsValidModelFile(AppModel.ModelPath(model.File))))
        {
            HistoryWhisperModelBox.Items.Add(model.Name);
        }

        var settings = UserSettings.Load();

        if (LLMModelBox.Items.Count > 0)
        {
            if (LLMModelBox.Items.Contains(settings.PreferredFormatterModel))
            {
                LLMModelBox.SelectedItem = settings.PreferredFormatterModel;
            }
            else
            {
                LLMModelBox.SelectedIndex = 0;
            }
        }
        else
        {
            LLMModelBox.PlaceholderText = "No LLM installed";
            LLMModelBox.IsEnabled = false;
        }

        if (HistoryWhisperModelBox.Items.Count > 0)
        {
            HistoryWhisperModelBox.SelectedIndex = 0;
        }
        else
        {
            HistoryWhisperModelBox.PlaceholderText = "No Whisper installed";
            HistoryWhisperModelBox.IsEnabled = false;
        }

        foreach (object item in FormatLanguageBox.Items)
        {
            if ((item as ComboBoxItem)?.Content?.ToString() == settings.FormatLanguage || item?.ToString() == settings.FormatLanguage)
            {
                FormatLanguageBox.SelectedItem = item;
                break;
            }
        }

        LLMModelBox.SelectionChanged += (sender, e) =>
        {
            if (LLMModelBox.SelectedItem is string selection)
            {
                var userSettings = UserSettings.Load();
                userSettings.PreferredFormatterModel = selection;
                userSettings.Save();
            }
        };

        FormatLanguageBox.SelectionChanged += (sender, e) =>
        {
            var val = (FormatLanguageBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? FormatLanguageBox.SelectedItem?.ToString() ?? "";
            if (!string.IsNullOrEmpty(val))
            {
                var userSettings = UserSettings.Load();
                userSettings.FormatLanguage = val;
                userSettings.Save();
            }
        };
    }

    private void LoadHistory()
    {
        var items = TranscriptionHistory.Load();
        HistoryListView.ItemsSource = items;
        if (items.Count > 0 && HistoryListView.SelectedItem == null)
        {
            HistoryListView.SelectedIndex = 0;
        }
    }

    private void HistoryListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (HistoryListView.SelectedItem is TranscriptionHistoryItem item)
        {
            _selectedItem = item;
            EmptyDetailsText.Visibility = Visibility.Collapsed;
            DetailsPane.Visibility = Visibility.Visible;

            SelectTab(TabRawButton);
            TranscriptBox.Text = item.RawTranscript;
            UpdateAudioPlayer(item);
        }
        else
        {
            _selectedItem = null;
            EmptyDetailsText.Visibility = Visibility.Visible;
            DetailsPane.Visibility = Visibility.Collapsed;
            StopAudio();
        }
    }

    private void UpdateAudioPlayer(TranscriptionHistoryItem item)
    {
        if (!string.IsNullOrEmpty(item.SourceFilePath) && File.Exists(item.SourceFilePath))
        {
            AudioPlayer.Source = MediaSource.CreateFromUri(new Uri(item.SourceFilePath));
            AudioPlayer.Visibility = Visibility.Visible;
        }
        else
        {
            StopAudio();
        }
    }

    private void StopAudio()
    {
        AudioPlayer.MediaPlayer?.Pause();
        AudioPlayer.Source = null;
        AudioPlayer.Visibility = Visibility.Collapsed;
    }

    private async void CalendarButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem is null) return;

        CalendarButton.IsEnabled = false;
        ShowStatus(AppStrings.History_FindingDates, InfoBarSeverity.Informational);
        try
        {
            List<ActionableEntity> entities = await LLMFormatter.ExtractActionableEntitiesAsync(_selectedItem.RawTranscript, LLMModelBox.SelectedItem as string);
            StatusBar.IsOpen = false;

            if (entities.Count == 0)
            {
                ShowStatus(AppStrings.History_NoDatesFound, InfoBarSeverity.Informational);
                return;
            }

            await ShowEntitiesDialogAsync(entities);
        }
        catch (Exception ex)
        {
            ShowStatus(ex.Message, InfoBarSeverity.Error);
        }
        finally
        {
            CalendarButton.IsEnabled = true;
        }
    }

    private async Task ShowEntitiesDialogAsync(List<ActionableEntity> entities)
    {
        var list = new StackPanel { Spacing = 10 };
        list.Children.Add(new TextBlock
        {
            Text = AppStrings.History_CalendarHint,
            Opacity = 0.7,
            FontSize = 12,
            TextWrapping = TextWrapping.Wrap,
        });

        foreach (ActionableEntity entity in entities)
        {
            var texts = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            texts.Children.Add(new TextBlock { Text = entity.Name, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            texts.Children.Add(new TextBlock { Text = entity.Quote, Opacity = 0.7, FontSize = 12, TextWrapping = TextWrapping.Wrap });

            var addButton = new Button { Content = AppStrings.History_AddButton, VerticalAlignment = VerticalAlignment.Center };
            ActionableEntity captured = entity;
            addButton.Click += (s, args) =>
            {
                bool allDay = !string.Equals(captured.Type, "time", StringComparison.OrdinalIgnoreCase);
                DateTime next = DateTime.Now.AddHours(1);
                DateTime start = allDay ? DateTime.Today : new DateTime(next.Year, next.Month, next.Day, next.Hour, 0, 0);
                CalendarHelper.AddEvent(captured.Name, captured.Quote, start, allDay);
            };

            var row = new Grid { ColumnSpacing = 12 };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(texts, 0);
            Grid.SetColumn(addButton, 1);
            row.Children.Add(texts);
            row.Children.Add(addButton);
            list.Children.Add(row);
        }

        var dialog = new ContentDialog
        {
            Title = AppStrings.History_DatesFoundTitle,
            Content = new ScrollViewer { Content = list, MaxHeight = 420 },
            CloseButtonText = AppStrings.History_Close,
            XamlRoot = this.XamlRoot,
        };
        await dialog.ShowAsync();
    }

    private void DeleteButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string id)
        {
            TranscriptionHistory.Delete(id);
            if (_selectedItem?.Id == id)
            {
                _selectedItem = null;
            }
            LoadHistory();
        }
    }

    private async void RenameButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string id)
        {
            var item = TranscriptionHistory.Load().FirstOrDefault(i => i.Id == id);
            if (item != null)
            {
                TextBox inputTextBox = new TextBox { Text = item.SourceFileName, AcceptsReturn = false };
                ContentDialog dialog = new ContentDialog
                {
                    Title = "Rename File",
                    Content = inputTextBox,
                    PrimaryButtonText = "Save",
                    CloseButtonText = "Cancel",
                    DefaultButton = ContentDialogButton.Primary,
                    XamlRoot = this.XamlRoot
                };

                ContentDialogResult result = await dialog.ShowAsync();
                if (result == ContentDialogResult.Primary && !string.IsNullOrWhiteSpace(inputTextBox.Text))
                {
                    var updatedItem = item with { SourceFileName = inputTextBox.Text.Trim() };
                    TranscriptionHistory.AddOrUpdate(updatedItem);
                    if (_selectedItem?.Id == id)
                    {
                        _selectedItem = updatedItem;
                    }
                    LoadHistory();
                }
            }
        }
    }

    private async void ReformatButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem == null || string.IsNullOrWhiteSpace(_selectedItem.RawTranscript))
            return;

        string? selectedFormatter = LLMModelBox.SelectedItem?.ToString();
        string formatLanguage = (FormatLanguageBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? FormatLanguageBox.SelectedItem?.ToString() ?? "Auto-Detect / Original";

        if (selectedFormatter == null)
        {
            ShowStatus("Please select a formatter model.", InfoBarSeverity.Error);
            return;
        }

        ReformatButton.IsEnabled = false;
        ShowStatus("Formatting transcript...", InfoBarSeverity.Informational);

        try
        {
            string? customPrompt = string.IsNullOrWhiteSpace(HistoryCustomPromptBox.Text) ? null : HistoryCustomPromptBox.Text;
            string? formatted = await LLMFormatter.FormatTranscriptAsync(_selectedItem.RawTranscript, selectedFormatter, formatLanguage, customPrompt);
            if (!string.IsNullOrWhiteSpace(formatted))
            {
                var updatedItem = _selectedItem with { FormattedTranscript = formatted };
                TranscriptionHistory.AddOrUpdate(updatedItem);
                
                _selectedItem = updatedItem;
                LoadHistory();
                HistoryListView.SelectedItem = HistoryListView.Items.Cast<TranscriptionHistoryItem>().FirstOrDefault(i => i.Id == updatedItem.Id);

                SelectTab(TabFormattedButton);
                TranscriptBox.Text = formatted;

                ShowStatus("Formatting complete.", InfoBarSeverity.Success);
            }
            else
            {
                ShowStatus("Formatting returned empty or failed.", InfoBarSeverity.Error);
            }
        }
        catch (Exception ex)
        {
            ShowStatus($"Error: {ex.Message}", InfoBarSeverity.Error);
        }
        finally
        {
            ReformatButton.IsEnabled = true;
        }
    }

    private void CopyFormattedButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrEmpty(TranscriptBox.Text))
        {
            DataPackage package = new();
            package.SetText(TranscriptBox.Text);
            Clipboard.SetContent(package);
            ShowStatus("Copied to clipboard.", InfoBarSeverity.Success);
        }
    }

    private async void ExportText_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(TranscriptBox.Text)) return;
        await SaveExportFileAsync(TranscriptBox.Text, ".txt", "Text Document");
    }

    private async void ExportSrt_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem == null || string.IsNullOrWhiteSpace(_selectedItem.SrtTranscript))
        {
            ShowStatus("No subtitle data available for this transcript. Please re-transcribe the file.", InfoBarSeverity.Error);
            return;
        }
        await SaveExportFileAsync(_selectedItem.SrtTranscript, ".srt", "SubRip Subtitle");
    }

    private async void ExportVtt_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem == null || string.IsNullOrWhiteSpace(_selectedItem.SrtTranscript))
        {
            ShowStatus("No subtitle data available for this transcript. Please re-transcribe the file.", InfoBarSeverity.Error);
            return;
        }
        string vtt = ConvertSrtToVtt(_selectedItem.SrtTranscript);
        await SaveExportFileAsync(vtt, ".vtt", "WebVTT Subtitle");
    }

    private string ConvertSrtToVtt(string srt)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("WEBVTT");
        sb.AppendLine();
        var lines = srt.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
        foreach (var line in lines)
        {
            if (line.Contains("-->"))
            {
                sb.AppendLine(line.Replace(",", "."));
            }
            else
            {
                sb.AppendLine(line);
            }
        }
        return sb.ToString();
    }

    private async Task SaveExportFileAsync(string content, string extension, string formatName)
    {
        var savePicker = new Windows.Storage.Pickers.FileSavePicker();
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow);
        WinRT.Interop.InitializeWithWindow.Initialize(savePicker, hwnd);
        
        savePicker.SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary;
        savePicker.FileTypeChoices.Add(formatName, new List<string>() { extension });
        savePicker.SuggestedFileName = (_selectedItem?.SourceFileName ?? "Transcript") + extension;

        var file = await savePicker.PickSaveFileAsync();
        if (file != null)
        {
            Windows.Storage.CachedFileManager.DeferUpdates(file);
            await Windows.Storage.FileIO.WriteTextAsync(file, content);
            Windows.Storage.Provider.FileUpdateStatus status = await Windows.Storage.CachedFileManager.CompleteUpdatesAsync(file);
            
            if (status == Windows.Storage.Provider.FileUpdateStatus.Complete)
            {
                ShowStatus($"File saved successfully: {file.Name}", InfoBarSeverity.Success);
            }
            else
            {
                ShowStatus($"File couldn't be saved: {file.Name}", InfoBarSeverity.Error);
            }
        }
    }

    private async void SummarizeButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem == null || string.IsNullOrWhiteSpace(_selectedItem.RawTranscript))
            return;

        string? selectedFormatter = LLMModelBox.SelectedItem?.ToString();
        string formatLanguage = (FormatLanguageBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? FormatLanguageBox.SelectedItem?.ToString() ?? "Auto-Detect / Original";

        if (selectedFormatter == null)
        {
            ShowStatus("Please select a summarization model.", InfoBarSeverity.Error);
            return;
        }

        SummarizeButton.IsEnabled = false;
        ShowStatus("Summarizing transcript...", InfoBarSeverity.Informational);

        try
        {
            string sourceText = string.IsNullOrWhiteSpace(_selectedItem.FormattedTranscript) ? _selectedItem.RawTranscript : _selectedItem.FormattedTranscript;
            string? customPrompt = string.IsNullOrWhiteSpace(HistoryCustomPromptBox.Text) ? null : HistoryCustomPromptBox.Text;
            string? summary = await LLMFormatter.SummarizeTranscriptAsync(sourceText, selectedFormatter, formatLanguage, customPrompt);
            
            if (!string.IsNullOrWhiteSpace(summary))
            {
                var updatedItem = _selectedItem with { Summary = summary };
                TranscriptionHistory.AddOrUpdate(updatedItem);
                
                _selectedItem = updatedItem;
                LoadHistory();
                HistoryListView.SelectedItem = HistoryListView.Items.Cast<TranscriptionHistoryItem>().FirstOrDefault(i => i.Id == updatedItem.Id);

                SelectTab(TabSummaryButton);
                TranscriptBox.Text = summary;

                ShowStatus("Summarization complete.", InfoBarSeverity.Success);
            }
            else
            {
                ShowStatus("Summarization returned empty or failed.", InfoBarSeverity.Error);
            }
        }
        catch (Exception ex)
        {
            ShowStatus($"Error: {ex.Message}", InfoBarSeverity.Error);
        }
        finally
        {
            SummarizeButton.IsEnabled = true;
        }
    }

    private async void ReTranscribeButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem == null) return;
        
        string? audioPath = _selectedItem.SourceFilePath;
        if (string.IsNullOrEmpty(audioPath) || !System.IO.File.Exists(audioPath))
        {
            var picker = new Windows.Storage.Pickers.FileOpenPicker();
            WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow));
            
            foreach (string extension in AppModel.MediaExtensions)
            {
                picker.FileTypeFilter.Add(extension);
            }
            
            var file = await picker.PickSingleFileAsync();
            if (file == null) return;
            audioPath = file.Path;
        }
        
        string? selectedWhisper = HistoryWhisperModelBox.SelectedItem?.ToString();
        if (string.IsNullOrEmpty(selectedWhisper))
        {
            ShowStatus("Please select a Whisper model.", InfoBarSeverity.Error);
            return;
        }

        var whisperModel = AppModel.WhisperModels.FirstOrDefault(m => m.Name == selectedWhisper);
        if (whisperModel == null) return;

        ReTranscribeButton.IsEnabled = false;
        ShowStatus("Transcribing with Whisper...", InfoBarSeverity.Informational);
        
        try
        {
            string wavPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ai_transcriber_input_winui_hist.wav");
            var settings = UserSettings.Load();
            string ffmpegArgs = settings.NormalizeAudio
                ? $"-y -i \"{audioPath}\" -vn -af highpass=f=80,lowpass=f=7800,loudnorm=I=-16:TP=-1.5:LRA=11 -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\""
                : $"-y -i \"{audioPath}\" -vn -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\"";
            
            await LLMFormatter.RunProcessAsync(AppModel.FfmpegExe, ffmpegArgs);
            
            string lang = _selectedItem.Language;
            string languageArg = AppModel.LanguageCode(lang);
            string modelPath = AppModel.ModelPath(whisperModel.File);
            string args = languageArg == "auto"
                ? $"-m \"{modelPath}\" -f \"{wavPath}\" -nt -osrt"
                : $"-m \"{modelPath}\" -f \"{wavPath}\" -l {languageArg} -nt -osrt";
                
            var result = await LLMFormatter.RunProcessAsync(AppModel.WhisperExe, args);
            
            string rawTranscript = result.Stdout.Trim();
            if (string.IsNullOrWhiteSpace(rawTranscript))
            {
                rawTranscript = $"[DEBUG: Stdout was empty. ExitCode={result.ExitCode}]\nStderr:\n{result.Stderr}";
            }
            
            string? srtTranscript = null;
            string expectedSrtPath = wavPath + ".srt";
            if (System.IO.File.Exists(expectedSrtPath))
            {
                srtTranscript = await System.IO.File.ReadAllTextAsync(expectedSrtPath);
                System.IO.File.Delete(expectedSrtPath);
            }
            
            var updatedItem = _selectedItem with { RawTranscript = rawTranscript, SourceFilePath = audioPath, SrtTranscript = srtTranscript };
            TranscriptionHistory.AddOrUpdate(updatedItem);
            
            _selectedItem = updatedItem;
            LoadHistory();
            HistoryListView.SelectedItem = HistoryListView.Items.Cast<TranscriptionHistoryItem>().FirstOrDefault(i => i.Id == updatedItem.Id);
            
            SelectTab(TabRawButton);
            TranscriptBox.Text = rawTranscript;
            
            ShowStatus("Re-transcription complete.", InfoBarSeverity.Success);
        }
        catch (Exception ex)
        {
            ShowStatus($"Error: {ex.Message}", InfoBarSeverity.Error);
        }
        finally
        {
            ReTranscribeButton.IsEnabled = true;
        }
    }

    private void TabRawButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem != null)
        {
            SelectTab(TabRawButton);
            TranscriptBox.Text = _selectedItem.RawTranscript;
        }
    }

    private void TabFormattedButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem != null)
        {
            SelectTab(TabFormattedButton);
            TranscriptBox.Text = _selectedItem.FormattedTranscript ?? string.Empty;
        }
    }

    private void TabSummaryButton_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedItem != null)
        {
            SelectTab(TabSummaryButton);
            TranscriptBox.Text = _selectedItem.Summary ?? string.Empty;
        }
    }

    private void SelectTab(Button selectedButton)
    {
        TabRawButton.Style = (Style)Application.Current.Resources["DefaultButtonStyle"];
        TabFormattedButton.Style = (Style)Application.Current.Resources["DefaultButtonStyle"];
        TabSummaryButton.Style = (Style)Application.Current.Resources["DefaultButtonStyle"];
        selectedButton.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
    }

    private void ShowStatus(string message, InfoBarSeverity severity) => _status.Show(message, severity);
}
