using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace MuffinTranscriber.Pages;

/// <summary>
/// Settings, mirroring the mobile screen group for group and row for row.
/// Every change applies immediately (no Save button), like on the phone.
/// </summary>
public sealed partial class SettingsPage : Page
{
    private bool _loading;
    private UserSettings _settings = UserSettings.Load();

    private readonly StatusBarController _status;

    public SettingsPage()
    {
        InitializeComponent();
        _status = new StatusBarController(StatusBar);

        _settings = UserSettings.Load();
        LoadSettingsIntoControls();
        LiveStrings.Attach(this, () =>
        {
            Bindings.Update();
            SyncSegments();
        });
    }

    /// <summary>"Models" row subtitle: how many are on disk, like mobile.</summary>
    public string ModelsInstalledText
    {
        get
        {
            int count = 0;
            foreach (ModelInfo model in AllModels())
            {
                if (AppModel.IsValidModelFile(AppModel.ModelPath(model.File))) count++;
            }
            return $"{count} {AppStrings.Models_Status_Installed}";
        }
    }

    public string VersionText => AppStrings.Settings_VersionFormat.Replace("{version}", AppStrings.AppVersion.TrimStart('v'));

    private static IEnumerable<ModelInfo> AllModels() =>
        AppModel.WhisperModels.Concat(AppModel.FormatterModels).Concat(AppModel.EmbeddingModels);

    private void LoadSettingsIntoControls()
    {
        _loading = true;
        _settings = UserSettings.Load();

        DefaultLanguageBox.ItemsSource = WhisperLanguages.TranscriptionNames;
        FormatLanguageBox.ItemsSource = WhisperLanguages.FormatNames;

        PreferredWhisperBox.Items.Clear();
        PreferredWhisperBox.Items.Add(AppStrings.Settings_AutoSelectModel);
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
            PreferredWhisperBox.SelectedItem = model is null ? AppStrings.Settings_AutoSelectModel : AppModel.CompactName(model);
        }

        PreferredFormatterBox.Items.Clear();
        foreach (ModelInfo model in AppModel.FormatterModels)
        {
            PreferredFormatterBox.Items.Add(model.Name);
        }
        if (PreferredFormatterBox.Items.Contains(_settings.PreferredFormatterModel))
        {
            PreferredFormatterBox.SelectedItem = _settings.PreferredFormatterModel;
        }
        else if (PreferredFormatterBox.Items.Count > 0)
        {
            PreferredFormatterBox.SelectedIndex = 0;
        }

        SelectComboItem(DefaultLanguageBox, _settings.DefaultLanguage);
        SelectComboItem(FormatLanguageBox, _settings.FormatLanguage);
        SelectByTag(AutoDeleteBox, _settings.AutoDeleteCacheDuration);
        SelectByTag(AppLanguageBox, _settings.AppLanguage);

        NormalizeAudioSwitch.IsOn = _settings.NormalizeAudio;
        AutoCopySwitch.IsOn = _settings.AutoCopyTranscript;
        TypewriterSwitch.IsOn = _settings.TypewriterEffect;
        FormatByDefaultSwitch.IsOn = _settings.FormatByDefault;
        SummarizeByDefaultSwitch.IsOn = _settings.SummarizeByDefault;
        ContextLearningSwitch.IsOn = _settings.EnableContextLearning;
        AutoUpdateCheckSwitch.IsOn = _settings.EnableAutoUpdateCheck;
        CustomFormatBox.Text = _settings.CustomFormatSystemPrompt;
        CustomSummaryBox.Text = _settings.CustomSummarySystemPrompt;

        SyncSegments();
        UpdateCacheSizes();
        _loading = false;
    }

    /// <summary>Paints the selected segment/swatch, the way the mobile
    /// SegmentedControl and SwatchRow show their active item.</summary>
    private void SyncSegments()
    {
        var selected = (Style)Application.Current.Resources["MuffinSegmentSelected"];
        var normal = (Style)Application.Current.Resources["MuffinSegment"];

        SpeedSlowButton.Style = _settings.TypewriterSpeed == "Slow" ? selected : normal;
        SpeedBalancedButton.Style = _settings.TypewriterSpeed == "Balanced" ? selected : normal;
        SpeedFastButton.Style = _settings.TypewriterSpeed == "Fast" ? selected : normal;
        TypingSpeedCard.Visibility = _settings.TypewriterEffect ? Visibility.Visible : Visibility.Collapsed;

        ThemeSystemButton.Style = _settings.ThemeMode == "System" ? selected : normal;
        ThemeLightButton.Style = _settings.ThemeMode == "Light" ? selected : normal;
        ThemeDarkButton.Style = _settings.ThemeMode == "Dark" ? selected : normal;
        ThemeAmoledButton.Style = _settings.ThemeMode == "AMOLED" ? selected : normal;

        SystemSwatchFill.Fill = new SolidColorBrush(MuffinTheme.WindowsAccent);
        var ring = (Brush)Application.Current.Resources["TextFillColorPrimaryBrush"];
        foreach ((Button swatch, string key) in new[]
        {
            (AccentSystemSwatch, "System"),
            (AccentMuffinSwatch, "Muffin"),
            (AccentGreenSwatch, "Green"),
            (AccentPurpleSwatch, "Purple"),
            (AccentRedSwatch, "Red"),
        })
        {
            swatch.BorderBrush = _settings.AccentColor == key ? ring : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        }
    }

    private void SaveOnSelectionChanged(object sender, SelectionChangedEventArgs e) => SaveSettings();

    private void SaveOnToggled(object sender, RoutedEventArgs e) => SaveSettings();

    private void TypewriterSwitch_Toggled(object sender, RoutedEventArgs e)
    {
        SaveSettings();
        SyncSegments();
    }

    private void SpeedButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string speed)
        {
            _settings.TypewriterSpeed = speed;
            _settings.Save();
            SyncSegments();
        }
    }

    private void ThemeButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string mode)
        {
            _settings.ThemeMode = mode;
            _settings.Save();
            ThemeHelper.Apply(App.MainWindow, mode);
            SyncSegments();
        }
    }

    // Repaints every accented control immediately (MuffinTheme mutates the live
    // brushes), so unlike a stock WinUI app this needs no restart.
    private void AccentSwatch_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string accent)
        {
            _settings.AccentColor = accent;
            _settings.Save();
            MuffinTheme.Apply(accent);
            SyncSegments();
        }
    }

    private void CustomPromptBox_TextChanged(object sender, TextChangedEventArgs e) => SaveSettings();

    private async void OpenMicSettings_Click(object sender, RoutedEventArgs e)
    {
        await Windows.System.Launcher.LaunchUriAsync(new Uri("ms-settings:privacy-microphone"));
    }

    private void PrivacyPolicy_Click(object sender, object e) => openPrivacyPolicy();

    private static async void openPrivacyPolicy()
    {
        await Windows.System.Launcher.LaunchUriAsync(
            new Uri("https://github.com/Riiickv/Muffin-transcriber/blob/main/PRIVACY.md"));
    }

    private void SaveSettings()
    {
        if (_loading) return;

        _settings.DefaultLanguage = SelectedComboText(DefaultLanguageBox);
        _settings.FormatLanguage = SelectedComboText(FormatLanguageBox);
        _settings.NormalizeAudio = NormalizeAudioSwitch.IsOn;
        _settings.AutoCopyTranscript = AutoCopySwitch.IsOn;
        _settings.TypewriterEffect = TypewriterSwitch.IsOn;
        _settings.FormatByDefault = FormatByDefaultSwitch.IsOn;
        _settings.SummarizeByDefault = SummarizeByDefaultSwitch.IsOn;
        _settings.EnableContextLearning = ContextLearningSwitch.IsOn;
        _settings.EnableAutoUpdateCheck = AutoUpdateCheckSwitch.IsOn;
        _settings.CustomFormatSystemPrompt = CustomFormatBox.Text;
        _settings.CustomSummarySystemPrompt = CustomSummaryBox.Text;
        _settings.AutoDeleteCacheDuration = SelectedTag(AutoDeleteBox) ?? _settings.AutoDeleteCacheDuration;

        if (PreferredWhisperBox.SelectedIndex <= 0)
        {
            _settings.PreferredWhisperModel = string.Empty;
        }
        else if (PreferredWhisperBox.SelectedItem is string preferredName)
        {
            _settings.PreferredWhisperModel = AppModel.WhisperModels
                .FirstOrDefault(model => AppModel.CompactName(model) == preferredName)?.File ?? string.Empty;
        }

        if (PreferredFormatterBox.SelectedItem is string formatter)
        {
            _settings.PreferredFormatterModel = formatter;
        }

        string? language = SelectedTag(AppLanguageBox);
        bool languageChanged = language is not null && language != _settings.AppLanguage;
        if (language is not null) _settings.AppLanguage = language;

        _settings.Save();

        // Applies immediately, like on mobile: reload the catalog and every page
        // re-evaluates its bindings.
        if (languageChanged) LocalizationManager.ChangeLanguage(_settings.AppLanguage);
    }

    private void ManageModels_Click(object sender, object e)
    {
        (App.MainWindow as MainWindow)?.NavigateTo("models");
    }

    private void OpenModelsFolder_Click(object sender, RoutedEventArgs e)
    {
        Directory.CreateDirectory(AppModel.ModelsDir);
        Process.Start(new ProcessStartInfo { FileName = AppModel.ModelsDir, UseShellExecute = true });
    }

    private void ResetSettings_Click(object sender, RoutedEventArgs e)
    {
        UserSettings.Reset();
        LoadSettingsIntoControls();
        ShowStatus(AppStrings.Settings_Status_Reset, InfoBarSeverity.Success);
    }

    private void ShowStatus(string message, InfoBarSeverity severity) => _status.Show(message, severity);

    private static void SelectComboItem(ComboBox box, string value) => UiHelpers.SelectComboItem(box, value, fallbackToFirst: true);

    private static string SelectedComboText(ComboBox box) => UiHelpers.SelectedComboText(box);

    private static void SelectByTag(ComboBox box, string tag)
    {
        foreach (object item in box.Items)
        {
            if (item is ComboBoxItem combo && combo.Tag?.ToString() == tag)
            {
                box.SelectedItem = item;
                return;
            }
        }
        if (box.Items.Count > 0) box.SelectedIndex = 0;
    }

    private static string? SelectedTag(ComboBox box) =>
        (box.SelectedItem as ComboBoxItem)?.Tag?.ToString();

    private void UpdateCacheSizes()
    {
        AudioCacheSizeText.Text = FormatSize(GetDirectorySize(AppModel.AudioCacheDir));
        VideoCacheSizeText.Text = FormatSize(GetDirectorySize(AppModel.VideoCacheDir));
    }

    private static long GetDirectorySize(string path)
    {
        if (!Directory.Exists(path)) return 0;
        return new DirectoryInfo(path).GetFiles().Sum(fi => fi.Length);
    }

    private static string FormatSize(long bytes)
    {
        string[] suffixes = ["B", "KB", "MB", "GB", "TB"];
        if (bytes == 0) return "0 MB";
        int place = Convert.ToInt32(Math.Floor(Math.Log(bytes, 1024)));
        double num = Math.Round(bytes / Math.Pow(1024, place), 1);
        return $"{num} {suffixes[place]}";
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

    private static void ClearCache(string path)
    {
        try
        {
            if (!Directory.Exists(path)) return;
            foreach (string file in Directory.GetFiles(path)) File.Delete(file);
        }
        catch
        {
        }
    }

    private async void EditMemory_Click(object sender, RoutedEventArgs e)
    {
        string memory = File.Exists(AppModel.UserMemoryFile) ? File.ReadAllText(AppModel.UserMemoryFile) : "";
        var textBox = new TextBox { Text = memory, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 200 };
        var dialog = new ContentDialog
        {
            Title = AppStrings.Settings_Dialog_EditMemoryTitle,
            Content = textBox,
            PrimaryButtonText = AppStrings.Settings_Dialog_Save,
            CloseButtonText = AppStrings.Settings_Dialog_Cancel,
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = XamlRoot,
        };

        if (await dialog.ShowAsync() == ContentDialogResult.Primary)
        {
            File.WriteAllText(AppModel.UserMemoryFile, textBox.Text);
            ShowStatus(AppStrings.Settings_Status_MemoryUpdated, InfoBarSeverity.Success);
        }
    }

    private void ClearMemory_Click(object sender, RoutedEventArgs e)
    {
        if (File.Exists(AppModel.UserMemoryFile)) File.Delete(AppModel.UserMemoryFile);
        ShowStatus(AppStrings.Settings_Status_MemoryCleared, InfoBarSeverity.Success);
    }

    private async void CheckUpdates_Click(object sender, RoutedEventArgs e)
    {
        CheckUpdatesButton.Content = AppStrings.Settings_UpdateChecking;
        CheckUpdatesButton.IsEnabled = false;

        var (available, latestVersion, url) = await AutoUpdater.CheckForUpdatesAsync();
        if (available)
        {
            CheckUpdatesButton.Content = AppStrings.Settings_UpdateFound;
            (App.MainWindow as MainWindow)?.ShowUpdateBanner(latestVersion, url);
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
