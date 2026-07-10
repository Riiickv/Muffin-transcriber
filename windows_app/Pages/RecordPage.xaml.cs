using System.Diagnostics;
using System.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI;
using Windows.ApplicationModel.DataTransfer;
using System.IO;
using System;
using System.Linq;

namespace MuffinTranscriber.Pages;

public sealed partial class RecordPage : Page
{
    private UserSettings _settings = new();
    private ModelInfo? _selectedWhisperModel;
    private MicrophoneRecorder? _recorder;
    private string _currentWavPath = string.Empty;
    private Microsoft.UI.Xaml.Shapes.Rectangle[] _visualizerBars = new Microsoft.UI.Xaml.Shapes.Rectangle[20];

    private string _currentRawTranscript = string.Empty;
    private string _currentFormattedTranscript = string.Empty;
    private string _currentSummary = string.Empty;
    
    private DispatcherTimer _statusTimer;

    public RecordPage()
    {
        InitializeComponent();
        _settings = UserSettings.Load();
        
        SetupVisualizer();
        
        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _statusTimer.Tick += (s, e) => { StatusBar.IsOpen = false; _statusTimer.Stop(); };

        LoadModels();
    }

    private void SetupVisualizer()
    {
        for (int i = 0; i < 20; i++)
        {
            var rect = new Microsoft.UI.Xaml.Shapes.Rectangle
            {
                Width = 6,
                Height = 4,
                Fill = new SolidColorBrush(Microsoft.UI.Colors.Firebrick),
                RadiusX = 3,
                RadiusY = 3,
                VerticalAlignment = VerticalAlignment.Center
            };
            _visualizerBars[i] = rect;
            VisualizerPanel.Children.Add(rect);
        }
    }
    
    private void LoadModels()
    {
        Directory.CreateDirectory(AppModel.ModelsDir);
        _settings = UserSettings.Load();
        SelectComboItem(LanguageBox, _settings.DefaultLanguage);
        FormatSwitch.IsOn = _settings.FormatByDefault;
        SelectComboItem(FormatLanguageBox, _settings.FormatLanguage);
        
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
            RecordButton.IsEnabled = false;
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

        WhisperModelBox.SelectionChanged += (s, e) =>
        {
            if (WhisperModelBox.SelectedItem is string selected)
            {
                _selectedWhisperModel = AppModel.WhisperModels.FirstOrDefault(model => AppModel.CompactName(model) == selected);
            }
        };
    }
    
    private double _smoothedPeak = 0;
    private Random _vizRandom = new Random();

    private void RecordButton_Click(object sender, RoutedEventArgs e)
    {
        if (NAudio.Wave.WaveInEvent.DeviceCount == 0)
        {
            ShowStatus("No microphones detected! Please plug in a microphone.", InfoBarSeverity.Error);
            return;
        }

        if (_recorder != null && _recorder.IsRecording)
        {
            // Stop recording
            RecordButton.Background = (SolidColorBrush)Application.Current.Resources["AccentFillColorDefaultBrush"];
            RecordIcon.Glyph = "\uE720";
            RecordStatusText.Text = "Processing...";
            RecordTimerText.Text = "Wait...";
            
            for (int i = 0; i < 20; i++)
            {
                _visualizerBars[i].Height = 4;
            }
            
            string savedPath = _recorder.Stop();
            _recorder.Dispose();
            _recorder = null;
            
            ProcessRecording(savedPath);
        }
        else
        {
            // Start recording
            RecordButton.Background = new SolidColorBrush(Microsoft.UI.Colors.Firebrick);
            RecordIcon.Glyph = "\uE71A"; // Stop
            RecordStatusText.Text = "Stop Recording";
            RecordTimerText.Text = "00:00:00";
            TranscriptBox.Text = string.Empty;
            _smoothedPeak = 0;
            
            _currentWavPath = Path.Combine(AppModel.AudioCacheDir, "record_" + Guid.NewGuid().ToString() + ".wav");
            
            _recorder = new MicrophoneRecorder();
            _recorder.ProgressChanged += (s, data) =>
            {
                DispatcherQueue.TryEnqueue(() => 
                {
                    RecordTimerText.Text = data.Time.ToString(@"hh\:mm\:ss");
                    
                    // Smooth volume
                    _smoothedPeak = _smoothedPeak + (data.PeakLevel - _smoothedPeak) * 0.3;
                    
                    for (int i = 0; i < 20; i++)
                    {
                        // Calculate bell
                        double distance = Math.Abs(9.5 - i) / 9.5;
                        double multiplier = 1.0 - (distance * distance);
                        
                        // Add jitter
                        double jitter = 0.7 + (_vizRandom.NextDouble() * 0.6); 
                        
                        double targetHeight = 4 + (_smoothedPeak * 1200 * multiplier * jitter);
                        if (targetHeight > 40) targetHeight = 40;
                        if (targetHeight < 4) targetHeight = 4;
                        
                        // Smooth bar
                        _visualizerBars[i].Height = _visualizerBars[i].Height + (targetHeight - _visualizerBars[i].Height) * 0.5;
                    }
                });
            };
            
            try 
            {
                _recorder.Start(_currentWavPath);
            }
            catch (Exception ex)
            {
                ShowStatus("Failed to access microphone. " + ex.Message, InfoBarSeverity.Error);
                RecordButton.Background = (SolidColorBrush)Application.Current.Resources["AccentFillColorDefaultBrush"];
                RecordIcon.Glyph = "\uE720";
                RecordStatusText.Text = "Start Recording";
                _recorder.Dispose();
                _recorder = null;
            }
        }
    }

    protected override void OnNavigatedFrom(Microsoft.UI.Xaml.Navigation.NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);

        // Stop the mic when leaving the page — otherwise recording keeps running
        // off-screen (and the device stays hot) until the user comes back.
        if (_recorder != null)
        {
            _recorder.Dispose();
            _recorder = null;

            RecordButton.Background = (SolidColorBrush)Application.Current.Resources["AccentFillColorDefaultBrush"];
            RecordIcon.Glyph = "";
            RecordStatusText.Text = "Start Recording";
            RecordTimerText.Text = "00:00:00";
            for (int i = 0; i < 20; i++)
            {
                _visualizerBars[i].Height = 4;
            }
        }
    }

    private async void ProcessRecording(string filePath)
    {
        if (_selectedWhisperModel is null) return;
        
        RecordButton.IsEnabled = false;
        BusyRing.IsActive = true;
        
        try
        {
            ShowStatus(AppStrings.Home_Status_PreparingAudio, InfoBarSeverity.Informational);
            
            // Fix audio
            string processedWavPath = Path.Combine(Path.GetTempPath(), "ai_transcriber_record.wav");
            string ffmpegArgs = _settings.NormalizeAudio
                ? $"-y -i \"{filePath}\" -vn -af highpass=f=80,lowpass=f=7800,loudnorm=I=-16:TP=-1.5:LRA=11 -ar 16000 -ac 1 -c:a pcm_s16le \"{processedWavPath}\""
                : $"-y -i \"{filePath}\" -vn -ar 16000 -ac 1 -c:a pcm_s16le \"{processedWavPath}\"";
            await LLMFormatter.RunProcessAsync(AppModel.FfmpegExe, ffmpegArgs);

            ShowStatus(AppStrings.Home_Status_TranscribingWhisper, InfoBarSeverity.Informational);
            string lang = SelectedComboText(LanguageBox);
            string languageArg = AppModel.LanguageCode(lang);
            string modelPath = AppModel.ModelPath(_selectedWhisperModel.File);
            string args = languageArg == "auto"
                ? $"-m \"{modelPath}\" -f \"{processedWavPath}\" -nt -osrt"
                : $"-m \"{modelPath}\" -f \"{processedWavPath}\" -l {languageArg} -nt -osrt";

            ProcessResult result = await LLMFormatter.RunProcessAsync(AppModel.WhisperExe, args);
            
            string rawTranscript = result.Stdout.Trim();
            if (string.IsNullOrWhiteSpace(rawTranscript))
            {
                Debug.WriteLine($"Whisper produced no output. ExitCode={result.ExitCode}. Stderr:\n{result.Stderr}");
                ShowStatus(AppStrings.Record_Status_NoAudioDetected, InfoBarSeverity.Error);
                return;
            }

            string? formatted = null;
            string? summary = null;
            
            _currentRawTranscript = rawTranscript;
            _currentFormattedTranscript = string.Empty;
            _currentSummary = string.Empty;
            
            SelectTab(TabRawButton);
            TranscriptBox.Text = _currentRawTranscript;

            if (FormatSwitch.IsOn)
            {
                ShowStatus(AppStrings.Home_Status_FormattingLLM, InfoBarSeverity.Informational);
                string customPrompt = RecordCustomFormatBox.Text;
                if (!string.IsNullOrWhiteSpace(customPrompt))
                {
                    _settings.CustomFormatSystemPrompt = customPrompt;
                    _settings.Save();
                }

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
                ShowStatus(AppStrings.Home_Status_SummarizingLLM, InfoBarSeverity.Informational);
                string inputForSummary = !string.IsNullOrWhiteSpace(formatted) ? formatted : rawTranscript;
                summary = await LLMFormatter.SummarizeTranscriptAsync(inputForSummary, SelectedComboText(FormatterModelBox), SelectedComboText(FormatLanguageBox));
                if (!string.IsNullOrWhiteSpace(summary))
                {
                    _currentSummary = summary;
                    SelectTab(TabSummaryButton);
                    TranscriptBox.Text = _currentSummary;
                }
            }

            string fileHash = await AppModel.ComputeFileHashAsync(filePath);
            TranscriptionHistory.AddOrUpdate(new TranscriptionHistoryItem(
                Guid.NewGuid().ToString(),
                DateTime.Now,
                "Voice Memo",
                lang,
                rawTranscript,
                formatted,
                summary,
                filePath,
                fileHash,
                null
            ));

            _ = LLMFormatter.ExtractContextAsync(rawTranscript, SelectedComboText(FormatterModelBox));
            
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
        catch (Exception ex)
        {
            ShowStatus(ex.Message, InfoBarSeverity.Error);
            TranscriptBox.Text = ex.ToString();
        }
        finally
        {
            BusyRing.IsActive = false;
            RecordButton.IsEnabled = true;
            RecordStatusText.Text = "Ready to Record";
            RecordTimerText.Text = "00:00:00";
        }
    }
    
    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        CopyTranscriptToClipboard();
        ShowStatus(AppStrings.Home_Status_CopiedToClipboard, InfoBarSeverity.Success);
    }

    private void CopyTranscriptToClipboard()
    {
        var dataPackage = new DataPackage();
        dataPackage.SetText(TranscriptBox.Text);
        Clipboard.SetContent(dataPackage);
    }

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

    private void ShowStatus(string message, InfoBarSeverity severity)
    {
        StatusBar.Message = message;
        StatusBar.Severity = severity;
        StatusBar.IsOpen = true;
        
        if (severity == InfoBarSeverity.Success || severity == InfoBarSeverity.Error)
        {
            _statusTimer.Stop();
            _statusTimer.Start();
        }
        else
        {
            _statusTimer.Stop();
        }
    }

    private static string SelectedComboText(ComboBox box)
    {
        return (box.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? box.SelectedItem?.ToString() ?? string.Empty;
    }

    private static void SelectComboItem(ComboBox box, string value)
    {
        foreach (object item in box.Items)
        {
            if ((item as ComboBoxItem)?.Content?.ToString() == value || item?.ToString() == value)
            {
                box.SelectedItem = item;
                return;
            }
        }
    }
}
