using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using MuffinTranscriber.Pages;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace MuffinTranscriber;

public sealed partial class MainWindow : Window
{
    private const double MinPaneLength = 220;
    private const double MaxPaneLength = 460;
    private readonly UserSettings _settings = UserSettings.Load();
    private bool _isResizingPane;
    private double _resizeStartX;
    private double _resizeStartPaneLength;
    private string _updateDownloadUrl = "";
    private string _installerPath = "";

    public MainWindow(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation = null)
    {
        InitializeComponent();
        _ = System.Threading.Tasks.Task.Run(() => AppModel.CleanCache());
        if (_settings.EnableAutoUpdateCheck)
        {
            _ = CheckForUpdatesAsync();
        }

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
        AppWindow.SetIcon("Assets/AppIcon.ico");
        ThemeHelper.Apply(this, _settings.ThemeMode);

        int startWidth = _settings.WindowWidth > 800 ? _settings.WindowWidth : 1000;
        int startHeight = _settings.WindowHeight > 600 ? _settings.WindowHeight : 650;
        
        AppWindow.Resize(new Windows.Graphics.SizeInt32(startWidth, startHeight));

        Closed += MainWindow_Closed;

        NavView.OpenPaneLength = Math.Clamp(_settings.SidebarWidth, MinPaneLength, MaxPaneLength);
        RootGrid.Loaded += (_, _) => UpdatePaneResizeGrip();
        typeof(UIElement).GetProperty("ProtectedCursor", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public)
            ?.SetValue(PaneResizeGrip, Microsoft.UI.Input.InputSystemCursor.Create(Microsoft.UI.Input.InputSystemCursorShape.SizeWestEast));
        
        NavFrame.Navigate(typeof(Pages.HomePage));
        if (shareOperation != null)
        {
            if (NavFrame.Content is Pages.HomePage hp)
            {
                hp.ProcessShareOperation(shareOperation);
            }
        }
    }

    public void HandleShareOperation(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation shareOperation)
    {
        NavFrame.Navigate(typeof(Pages.HomePage));
        if (NavFrame.Content is Pages.HomePage hp)
        {
            hp.ProcessShareOperation(shareOperation);
        }
    }

    private void MainWindow_Closed(object sender, WindowEventArgs args)
    {
        _settings.WindowWidth = AppWindow.Size.Width;
        _settings.WindowHeight = AppWindow.Size.Height;
        _settings.Save();
        EmbeddingService.Shutdown();
    }

    private void TitleBar_PaneToggleRequested(TitleBar sender, object args)
    {
        NavView.IsPaneOpen = !NavView.IsPaneOpen;
        UpdatePaneResizeGrip();
    }
    private void TitleBar_BackRequested(TitleBar sender, object args)
    {
        NavFrame.GoBack();
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.IsSettingsSelected)
        {
            if (NavFrame.CurrentSourcePageType != typeof(Pages.SettingsPage))
                NavFrame.Navigate(typeof(Pages.SettingsPage));
        }
        else if (args.SelectedItem is NavigationViewItem item)
        {
            switch (item.Tag)
            {
                case "home":
                    if (NavFrame.CurrentSourcePageType != typeof(Pages.HomePage))
                        NavFrame.Navigate(typeof(Pages.HomePage));
                    break;
                case "record":
                    if (NavFrame.CurrentSourcePageType != typeof(Pages.RecordPage))
                        NavFrame.Navigate(typeof(Pages.RecordPage));
                    break;
                case "history":
                    if (NavFrame.CurrentSourcePageType != typeof(Pages.HistoryPage))
                        NavFrame.Navigate(typeof(Pages.HistoryPage));
                    break;
                case "chat":
                    if (NavFrame.CurrentSourcePageType != typeof(Pages.ChatPage))
                        NavFrame.Navigate(typeof(Pages.ChatPage));
                    break;
                case "models":
                    if (NavFrame.CurrentSourcePageType != typeof(Pages.ModelsPage))
                        NavFrame.Navigate(typeof(Pages.ModelsPage));
                    break;
                default:
                    throw new InvalidOperationException($"Unknown navigation item tag: {item.Tag}");
            }
        }
    }

    // Called by the chat assistant's NAVIGATE_TO action.
    public void NavigateTo(string tag)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            if (tag == "settings")
            {
                NavView.SelectedItem = NavView.SettingsItem;
                return;
            }

            foreach (NavigationViewItem item in NavView.MenuItems.OfType<NavigationViewItem>())
            {
                if ((item.Tag as string) == tag)
                {
                    NavView.SelectedItem = item;
                    return;
                }
            }
        });
    }

    private void PaneResizeGrip_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (!NavView.IsPaneOpen)
        {
            return;
        }

        _isResizingPane = true;
        _resizeStartX = e.GetCurrentPoint(RootGrid).Position.X;
        _resizeStartPaneLength = NavView.OpenPaneLength;
        PaneResizeGrip.CapturePointer(e.Pointer);
        e.Handled = true;
    }

    private void PaneResizeGrip_PointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (!_isResizingPane)
        {
            return;
        }

        double currentX = e.GetCurrentPoint(RootGrid).Position.X;
        double nextLength = Math.Clamp(_resizeStartPaneLength + currentX - _resizeStartX, MinPaneLength, MaxPaneLength);
        NavView.OpenPaneLength = nextLength;
        // Persist only on release — writing here rewrote the whole settings JSON on every pointer-move.
        UpdatePaneResizeGrip();
        e.Handled = true;
    }

    private void PaneResizeGrip_PointerReleased(object sender, PointerRoutedEventArgs e)
    {
        if (!_isResizingPane)
        {
            return;
        }

        _isResizingPane = false;
        PaneResizeGrip.ReleasePointerCapture(e.Pointer);
        _settings.SidebarWidth = NavView.OpenPaneLength;
        _settings.Save();
        UpdatePaneResizeGrip();
        e.Handled = true;
    }

    private void UpdatePaneResizeGrip()
    {
        PaneResizeGrip.Visibility = NavView.IsPaneOpen ? Visibility.Visible : Visibility.Collapsed;
        PaneResizeGrip.Margin = new Thickness(Math.Max(0, NavView.OpenPaneLength - PaneResizeGrip.Width / 2), 0, 0, 0);
    }

    private async Task CheckForUpdatesAsync()
    {
        var (available, latestVersion, url) = await AutoUpdater.CheckForUpdatesAsync();
        if (available)
        {
            ShowUpdateBanner(latestVersion, url);
        }
    }

    public void ShowUpdateBanner(string latestVersion, string url)
    {
        _updateDownloadUrl = url;
        UpdateBanner.Message = string.Format(AppStrings.Update_StatusAvailableFormat, latestVersion);
        UpdateBanner.IsOpen = true;
    }

    private async void UpdateActionButton_Click(object sender, RoutedEventArgs e)
    {
        if (UpdateActionButton.Content.ToString() == AppStrings.Update_BtnRestart)
        {
            if (!AutoUpdater.InstallAndRestart(_installerPath))
            {
                UpdateBanner.Severity = InfoBarSeverity.Warning;
                UpdateBanner.Message = AppStrings.Update_StatusInstallCancelled;
            }
            return;
        }

        UpdateActionButton.IsEnabled = false;
        UpdateActionButton.Content = AppStrings.Update_BtnDownloading;
        UpdateProgressBar.Visibility = Visibility.Visible;
        UpdateProgressBar.Value = 0;

        try
        {
            var progress = new Progress<int>(p => UpdateProgressBar.Value = p);
            _installerPath = await AutoUpdater.DownloadUpdateAsync(_updateDownloadUrl, progress);

            UpdateActionButton.Content = AppStrings.Update_BtnRestart;
            UpdateActionButton.IsEnabled = true;
            UpdateBanner.Message = AppStrings.Update_StatusReady;
        }
        catch (Exception ex)
        {
            UpdateBanner.Severity = InfoBarSeverity.Error;
            UpdateBanner.Message = string.Format(AppStrings.Update_StatusFailedFormat, ex.Message);
            UpdateProgressBar.Visibility = Visibility.Collapsed;
            UpdateActionButton.Content = AppStrings.Update_BtnUpdate;
            UpdateActionButton.IsEnabled = true;
        }
    }
}
