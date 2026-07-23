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

    // Non-null while a finished recording is being processed; the record button
    // acts as Cancel during that window.
    private CancellationTokenSource? _processCts;

    private readonly StatusBarController _status;

    public RecordPage()
    {
        InitializeComponent();
        _settings = UserSettings.Load();

        SetupVisualizer();

        _status = new StatusBarController(StatusBar);

        LoadModels();
        Output.Copied += (_, _) => ShowStatus(AppStrings.Home_Status_CopiedToClipboard, InfoBarSeverity.Success);
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
        LanguageBox.ItemsSource = WhisperLanguages.TranscriptionNames;
        FormatLanguageBox.ItemsSource = WhisperLanguages.FormatNames;
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
            WhisperModelBox.PlaceholderText = AppStrings.Common_NoModelInstalled;
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
        // Third state: processing a finished recording. The button cancels it.
        if (_processCts is not null)
        {
            _processCts.Cancel();
            return;
        }

        if (NAudio.Wave.WaveInEvent.DeviceCount == 0)
        {
            ShowStatus(AppStrings.Record_Status_NoMic, InfoBarSeverity.Error);
            return;
        }

        if (_recorder != null && _recorder.IsRecording)
        {
            RecordButton.Background = (SolidColorBrush)Application.Current.Resources["AccentFillColorDefaultBrush"];
            RecordIcon.Glyph = "\uE720";
            RecordStatusText.Text = AppStrings.Record_Status_Processing;
            RecordTimerText.Text = AppStrings.Record_Status_Wait;
            
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
            RecordButton.Background = new SolidColorBrush(Microsoft.UI.Colors.Firebrick);
            RecordIcon.Glyph = "\uE71A"; // Stop
            RecordStatusText.Text = AppStrings.Record_StopButton;
            RecordTimerText.Text = "00:00:00";
            Output.Reset();
            _smoothedPeak = 0;
            
            _currentWavPath = Path.Combine(AppModel.AudioCacheDir, "record_" + Guid.NewGuid().ToString() + ".wav");
            
            _recorder = new MicrophoneRecorder();
            _recorder.ProgressChanged += (s, data) =>
            {
                DispatcherQueue.TryEnqueue(() => 
                {
                    RecordTimerText.Text = data.Time.ToString(@"hh\:mm\:ss");
                    
                    _smoothedPeak = _smoothedPeak + (data.PeakLevel - _smoothedPeak) * 0.3;
                    
                    for (int i = 0; i < 20; i++)
                    {
                        // Calculate bell
                        double distance = Math.Abs(9.5 - i) / 9.5;
                        double multiplier = 1.0 - (distance * distance);
                        
                        double jitter = 0.7 + (_vizRandom.NextDouble() * 0.6);
                        
                        double targetHeight = 4 + (_smoothedPeak * 1200 * multiplier * jitter);
                        if (targetHeight > 40) targetHeight = 40;
                        if (targetHeight < 4) targetHeight = 4;
                        
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
                ShowStatus(string.Format(AppStrings.Record_Status_MicFailedFormat, ex.Message), InfoBarSeverity.Error);
                RecordButton.Background = (SolidColorBrush)Application.Current.Resources["AccentFillColorDefaultBrush"];
                RecordIcon.Glyph = "\uE720";
                RecordStatusText.Text = AppStrings.Record_StartButton;
                _recorder.Dispose();
                _recorder = null;
            }
        }
    }

    protected override void OnNavigatedFrom(Microsoft.UI.Xaml.Navigation.NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);

        // Stop the mic on navigate-away, else it keeps recording off-screen.
        if (_recorder != null)
        {
            _recorder.Dispose();
            _recorder = null;

            RecordButton.Background = (SolidColorBrush)Application.Current.Resources["AccentFillColorDefaultBrush"];
            RecordIcon.Glyph = "";
            RecordStatusText.Text = AppStrings.Record_StartButton;
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

        _processCts = new CancellationTokenSource();
        CancellationToken ct = _processCts.Token;
        RecordStatusText.Text = AppStrings.Home_CancelButton;
        BusyRing.IsActive = true;

        var whisperProgress = new Progress<int>(pct =>
            ShowStatus(string.Format(AppStrings.Home_Status_TranscribingPercentFormat, pct), InfoBarSeverity.Informational));

        try
        {
            ShowStatus(AppStrings.Home_Status_TranscribingWhisper, InfoBarSeverity.Informational);
            string lang = SelectedComboText(LanguageBox);
            TranscriptionResult tr = await TranscriptionService.TranscribeAsync(filePath, _selectedWhisperModel, lang, _settings.NormalizeAudio, whisperProgress, ct);

            string rawTranscript = tr.RawTranscript;
            if (string.IsNullOrWhiteSpace(rawTranscript))
            {
                Debug.WriteLine($"Whisper produced no output. ExitCode={tr.WhisperExitCode}. Stderr:\n{tr.WhisperStderr}");
                ShowStatus(AppStrings.Record_Status_NoAudioDetected, InfoBarSeverity.Error);
                return;
            }

            string? formatted = null;
            string? summary = null;

            Output.ShowRaw(rawTranscript, animate: true);

            if (FormatSwitch.IsOn)
            {
                ShowStatus(AppStrings.Home_Status_FormattingLLM, InfoBarSeverity.Informational);
                string customPrompt = RecordCustomFormatBox.Text;
                if (!string.IsNullOrWhiteSpace(customPrompt))
                {
                    _settings.CustomFormatSystemPrompt = customPrompt;
                    _settings.Save();
                }

                formatted = await LLMFormatter.FormatTranscriptAsync(rawTranscript, SelectedComboText(FormatterModelBox), SelectedComboText(FormatLanguageBox), ct: ct, onPartial: p => Output.ShowFormatted(p));
                if (!string.IsNullOrWhiteSpace(formatted))
                {
                    Output.ShowFormatted(formatted);
                }
            }

            if (SummarizeSwitch.IsOn)
            {
                ShowStatus(AppStrings.Home_Status_SummarizingLLM, InfoBarSeverity.Informational);
                string inputForSummary = !string.IsNullOrWhiteSpace(formatted) ? formatted : rawTranscript;
                summary = await LLMFormatter.SummarizeTranscriptAsync(inputForSummary, SelectedComboText(FormatterModelBox), SelectedComboText(FormatLanguageBox), ct: ct);
                if (!string.IsNullOrWhiteSpace(summary))
                {
                    Output.ShowSummary(summary);
                }
            }

            string fileHash = await AppModel.ComputeFileHashAsync(filePath);
            TranscriptionHistory.AddOrUpdate(new TranscriptionHistoryItem(
                Guid.NewGuid().ToString(),
                DateTime.Now,
                AppStrings.Record_VoiceMemoName,
                lang,
                rawTranscript,
                formatted,
                summary,
                filePath,
                fileHash,
                tr.Srt
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
        catch (OperationCanceledException)
        {
            ShowStatus(AppStrings.Home_Status_Cancelled, InfoBarSeverity.Informational);
        }
        catch (Exception ex)
        {
            CrashLog.Write("RecordPage transcription", ex);
            string? friendly = EngineHealth.FriendlyMessage(ex);
            ShowStatus(friendly ?? ex.Message, InfoBarSeverity.Error);
            Output.ShowRaw(friendly ?? ex.ToString(), animate: false);
        }
        finally
        {
            _processCts?.Dispose();
            _processCts = null;
            BusyRing.IsActive = false;
            RecordButton.IsEnabled = true;
            RecordStatusText.Text = AppStrings.Record_StartButton;
            RecordTimerText.Text = "00:00:00";
        }
    }
    
    private void CopyTranscriptToClipboard() => UiHelpers.CopyToClipboard(Output.FullText);

    private void ShowStatus(string message, InfoBarSeverity severity) => _status.Show(message, severity);

    private static string SelectedComboText(ComboBox box) => UiHelpers.SelectedComboText(box);

    private static void SelectComboItem(ComboBox box, string value) => UiHelpers.SelectComboItem(box, value);
}
