using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace MuffinTranscriber.Pages;

public sealed partial class SettingsPage : Page
{
    private bool _loading;
    private UserSettings _settings = UserSettings.Load();

    private DispatcherTimer _statusTimer;

    public SettingsPage()
    {
        InitializeComponent();
        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _statusTimer.Tick += (s, e) => { StatusBar.IsOpen = false; _statusTimer.Stop(); };

        _settings = UserSettings.Load();
        LoadSettingsIntoControls();
    }

    private void LoadSettingsIntoControls()
    {
        _loading = true;
        _settings = UserSettings.Load();

        DefaultLanguageBox.ItemsSource = WhisperLanguages.TranscriptionNames;
        FormatLanguageBox.ItemsSource = WhisperLanguages.FormatNames;

        PreferredWhisperBox.Items.Clear();
        PreferredWhisperBox.Items.Add("Auto-select best installed model");
        foreach (ModelInfo model in AppModel.WhisperModels)
        {
            PreferredWhisperBox.Items.Add(AppModel.CompactName(model));
        }

        if (string.IsNullOrWhiteSpace(_settings.PreferredWhisperModel))
        {
            PreferredWhisperBox.SelectedIndex = 0;
        }
        else
        {
            ModelInfo? model = AppModel.WhisperModels.FirstOrDefault(item => item.File == _settings.PreferredWhisperModel);
            PreferredWhisperBox.SelectedItem = model is null ? "Auto-select best installed model" : AppModel.CompactName(model);
        }

        SelectComboItem(DefaultLanguageBox, _settings.DefaultLanguage);
        SelectComboItem(FormatLanguageBox, _settings.FormatLanguage);
        SelectComboItem(AutoDeleteBox, _settings.AutoDeleteCacheDuration);
        
        foreach (var item in AppLanguageBox.Items)
        {
            if (item is Microsoft.UI.Xaml.Controls.ComboBoxItem combo && combo.Tag?.ToString() == _settings.AppLanguage)
            {
                AppLanguageBox.SelectedItem = item;
                break;
            }
        }
        FormatByDefaultSwitch.IsOn = _settings.FormatByDefault;
        NormalizeAudioSwitch.IsOn = _settings.NormalizeAudio;
        AutoCopySwitch.IsOn = _settings.AutoCopyTranscript;
        ContextLearningSwitch.IsOn = _settings.EnableContextLearning;
        AutoUpdateCheckSwitch.IsOn = _settings.EnableAutoUpdateCheck;
        CustomFormatBox.Text = _settings.CustomFormatSystemPrompt;
        CustomSummaryBox.Text = _settings.CustomSummarySystemPrompt;

        UpdateCacheSizes();
        _loading = false;
    }

    private void SaveOnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SaveSettings();
    }

    private void SaveOnToggled(object sender, RoutedEventArgs e)
    {
        SaveSettings();
    }

    private void CustomPromptBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        SaveSettings();
    }


    private async void OpenMicSettings_Click(object sender, RoutedEventArgs e)
    {
        await Windows.System.Launcher.LaunchUriAsync(new Uri("ms-settings:privacy-microphone"));
    }

    private void ResetFormatPrompt_Click(object sender, RoutedEventArgs e)
    {
        CustomFormatBox.Text = string.Empty;
    }

    private void ResetSummaryPrompt_Click(object sender, RoutedEventArgs e)
    {
        CustomSummaryBox.Text = string.Empty;
    }

    private void SaveSettings()
    {
        if (_loading)
        {
            return;
        }

        _settings.DefaultLanguage = SelectedComboText(DefaultLanguageBox);
        _settings.FormatLanguage = SelectedComboText(FormatLanguageBox);
        _settings.FormatByDefault = FormatByDefaultSwitch.IsOn;
        _settings.NormalizeAudio = NormalizeAudioSwitch.IsOn;
        _settings.AutoCopyTranscript = AutoCopySwitch.IsOn;
        _settings.EnableContextLearning = ContextLearningSwitch.IsOn;
        _settings.EnableAutoUpdateCheck = AutoUpdateCheckSwitch.IsOn;
        if (AppLanguageBox.SelectedItem is Microsoft.UI.Xaml.Controls.ComboBoxItem combo && combo.Tag != null)
        {
            _settings.AppLanguage = combo.Tag.ToString()!;
        }

        _settings.Save();
        _settings.CustomFormatSystemPrompt = CustomFormatBox.Text;
        _settings.CustomSummarySystemPrompt = CustomSummaryBox.Text;

        if (PreferredWhisperBox.SelectedIndex <= 0)
        {
            _settings.PreferredWhisperModel = string.Empty;
        }
        else if (PreferredWhisperBox.SelectedItem is string preferredName)
        {
            _settings.PreferredWhisperModel = AppModel.WhisperModels.FirstOrDefault(model => AppModel.CompactName(model) == preferredName)?.File ?? string.Empty;
        }

        _settings.Save();
        ShowStatus("Settings saved.", InfoBarSeverity.Success);
    }

    private void OpenModelsFolder_Click(object sender, RoutedEventArgs e)
    {
        Directory.CreateDirectory(AppModel.ModelsDir);
        Process.Start(new ProcessStartInfo
        {
            FileName = AppModel.ModelsDir,
            UseShellExecute = true,
        });
    }

    private void ResetSettings_Click(object sender, RoutedEventArgs e)
    {
        UserSettings.Reset();
        LoadSettingsIntoControls();
        ShowStatus(AppStrings.Settings_Status_Reset, InfoBarSeverity.Success);
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

        if (box.Items.Count > 0)
        {
            box.SelectedIndex = 0;
        }
    }

    private static string SelectedComboText(ComboBox box)
    {
        return (box.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? box.SelectedItem?.ToString() ?? string.Empty;
    }

    private void UpdateCacheSizes()
    {
        AudioCacheSizeText.Text = FormatSize(GetDirectorySize(AppModel.AudioCacheDir));
        VideoCacheSizeText.Text = FormatSize(GetDirectorySize(AppModel.VideoCacheDir));
    }

    private long GetDirectorySize(string path)
    {
        if (!Directory.Exists(path)) return 0;
        return new DirectoryInfo(path).GetFiles().Sum(fi => fi.Length);
    }

    private string FormatSize(long bytes)
    {
        string[] suf = { "B", "KB", "MB", "GB", "TB" };
        if (bytes == 0) return "0 MB";
        int place = Convert.ToInt32(Math.Floor(Math.Log(bytes, 1024)));
        double num = Math.Round(bytes / Math.Pow(1024, place), 1);
        return $"{num} {suf[place]}";
    }

    private void ClearAudioCache_Click(object sender, RoutedEventArgs e)
    {
        ClearCache(AppModel.AudioCacheDir);
        TranscriptionHistory.PurgeMissingSourceFiles();
        UpdateCacheSizes();
        ShowStatus(AppStrings.Settings_Status_AudioCacheCleared, InfoBarSeverity.Success);
    }

    private void ClearVideoCache_Click(object sender, RoutedEventArgs e)
    {
        ClearCache(AppModel.VideoCacheDir);
        TranscriptionHistory.PurgeMissingSourceFiles();
        UpdateCacheSizes();
        ShowStatus(AppStrings.Settings_Status_VideoCacheCleared, InfoBarSeverity.Success);
    }
    
    private async void EditMemory_Click(object sender, RoutedEventArgs e)
    {
        string memory = System.IO.File.Exists(AppModel.UserMemoryFile) ? System.IO.File.ReadAllText(AppModel.UserMemoryFile) : "";
        var textBox = new TextBox { Text = memory, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 200 };
        var dialog = new ContentDialog
        {
            Title = AppStrings.Settings_Dialog_EditMemoryTitle,
            Content = textBox,
            PrimaryButtonText = AppStrings.Settings_Dialog_Save,
            CloseButtonText = AppStrings.Settings_Dialog_Cancel,
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = this.XamlRoot
        };

        if (await dialog.ShowAsync() == ContentDialogResult.Primary)
        {
            System.IO.File.WriteAllText(AppModel.UserMemoryFile, textBox.Text);
            ShowStatus(AppStrings.Settings_Status_MemoryUpdated, InfoBarSeverity.Success);
        }
    }

    private void ClearMemory_Click(object sender, RoutedEventArgs e)
    {
        if (System.IO.File.Exists(AppModel.UserMemoryFile))
        {
            System.IO.File.Delete(AppModel.UserMemoryFile);
        }
        ShowStatus(AppStrings.Settings_Status_MemoryCleared, InfoBarSeverity.Success);
    }

    private void ClearCache(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                foreach (var file in Directory.GetFiles(path))
                {
                    File.Delete(file);
                }
            }
        }
        catch { }
    }

    private async void CheckUpdates_Click(object sender, RoutedEventArgs e)
    {
        CheckUpdatesButton.Content = AppStrings.Settings_UpdateChecking;
        CheckUpdatesButton.IsEnabled = false;

        var (available, latestVersion, url) = await AutoUpdater.CheckForUpdatesAsync();

        if (available)
        {
            CheckUpdatesButton.Content = AppStrings.Settings_UpdateFound;
            if (App.MainWindow is MainWindow mainWindow)
            {
                mainWindow.ShowUpdateBanner(latestVersion, url);
            }
        }
        else
        {
            CheckUpdatesButton.Content = AppStrings.Settings_UpdateUpToDate;
            await Task.Delay(2000);
            CheckUpdatesButton.Content = AppStrings.Settings_BtnCheckUpdates;
            CheckUpdatesButton.IsEnabled = true;
        }
    }
}
