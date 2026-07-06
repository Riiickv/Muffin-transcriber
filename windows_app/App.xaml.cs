using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace MuffinTranscriber;

/// <summary>
/// Provides application-specific behavior to supplement the default Application class.
/// </summary>
public partial class App : Application
{
    private Window? _window;
    public static Window? MainWindow { get; private set; }
    
    /// <summary>
    /// Initializes the singleton application object.  This is the first line of authored code
    /// executed, and as such is the logical equivalent of main() or WinMain().
    /// </summary>
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
            _window = new MainWindow(null);
            MainWindow = _window;
        }
        _window.Activate();
    }
}
