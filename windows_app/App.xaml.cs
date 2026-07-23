using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;

namespace MuffinTranscriber;

public partial class App : Application
{
    private Window? _window;
    public static Window? MainWindow { get; private set; }

    public App()
    {
        InitializeComponent();
        Microsoft.Windows.AppLifecycle.AppInstance.GetCurrent().Activated += App_Activated;

        // Crash net: log everything; keep the app alive for UI-thread faults.
        // Before this, any unhandled exception killed the window with no trace.
        UnhandledException += (s, e) =>
        {
            CrashLog.Write("UnhandledException (XAML)", e.Exception);
            e.Handled = true;
            if (MainWindow is MainWindow main)
            {
                main.ShowCrashNotice();
            }
        };
        System.AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        {
            if (e.ExceptionObject is System.Exception ex)
            {
                CrashLog.Write("UnhandledException (AppDomain)", ex);
            }
        };
        System.Threading.Tasks.TaskScheduler.UnobservedTaskException += (s, e) =>
        {
            CrashLog.Write("UnobservedTaskException", e.Exception);
            e.SetObserved();
        };
    }

    public static void SetMainWindow(Window window)
    {
        MainWindow = window;
    }

    private void App_Activated(object? sender, Microsoft.Windows.AppLifecycle.AppActivationArguments e)
    {
        if (e.Kind == Microsoft.Windows.AppLifecycle.ExtendedActivationKind.ShareTarget)
        {
            if (e.Data is Windows.ApplicationModel.Activation.ShareTargetActivatedEventArgs shareArgs)
            {
                var shareOperation = shareArgs.ShareOperation;
                
                if (_window != null)
                {
                    _window.DispatcherQueue.TryEnqueue(() => 
                    {
                        var miniWindow = new MiniWindow(shareOperation);
                        miniWindow.Activate();
                    });
                }
            }
        }
        else
        {
            if (_window != null)
            {
                _window.DispatcherQueue.TryEnqueue(() => _window.Activate());
            }
        }
    }

    protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
    {
        _ = TranscriptionHistory.RunMigrationAsync();

        // Load the UI language BEFORE building any window: the pages bind their
        // text with x:Bind (OneTime), which evaluates during InitializeComponent,
        // so the strings must already be loaded or the first render is English.
        var settings = UserSettings.Load();
        LocalizationManager.CreateDefaultLanguageFile();
        LocalizationManager.LoadLanguage(settings.AppLanguage);

        // Same reason as the language above: controls resolve their accent
        // brushes when they load, so ours have to be in place first.
        MuffinTheme.Install(settings.AccentColor);

        Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation = null;
        var activatedArgs = Microsoft.Windows.AppLifecycle.AppInstance.GetCurrent().GetActivatedEventArgs();

        if (activatedArgs.Kind == Microsoft.Windows.AppLifecycle.ExtendedActivationKind.ShareTarget)
        {
            if (activatedArgs.Data is Windows.ApplicationModel.Activation.ShareTargetActivatedEventArgs shareArgs)
            {
                shareOperation = shareArgs.ShareOperation;
            }
        }

        if (shareOperation != null)
        {
            _window = new MiniWindow(shareOperation);
        }
        else
        {
            _window = new MainWindow();
            MainWindow = _window;
        }

        _window.Activate();
    }
}
