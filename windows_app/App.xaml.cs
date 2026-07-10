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

        var settings = UserSettings.Load();
        LocalizationManager.CreateDefaultLanguageFile();
        LocalizationManager.LoadLanguage(settings.AppLanguage);

        _window.Activate();
    }
}
