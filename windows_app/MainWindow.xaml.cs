using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using AITranscriber_WinUI.Pages;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace AITranscriber_WinUI;

public sealed partial class MainWindow : Window
{
    private const double MinPaneLength = 220;
    private const double MaxPaneLength = 460;
    private readonly UserSettings _settings = UserSettings.Load();
    private bool _isResizingPane;
    private double _resizeStartX;
    private double _resizeStartPaneLength;

    public MainWindow(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation = null)
    {
        InitializeComponent();
        _ = System.Threading.Tasks.Task.Run(() => AppModel.CleanCache());

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
        AppWindow.SetIcon("Assets/AppIcon.ico");

        if (_settings.WindowWidth > 0 && _settings.WindowHeight > 0)
        {
            AppWindow.Resize(new Windows.Graphics.SizeInt32(_settings.WindowWidth, _settings.WindowHeight));
        }

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
                case "models":
                    if (NavFrame.CurrentSourcePageType != typeof(Pages.ModelsPage))
                        NavFrame.Navigate(typeof(Pages.ModelsPage));
                    break;
                default:
                    throw new InvalidOperationException($"Unknown navigation item tag: {item.Tag}");
            }
        }
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
        _settings.SidebarWidth = nextLength;
        _settings.Save();
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
}
