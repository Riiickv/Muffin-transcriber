using System;
using System.Threading;
using Microsoft.UI.Dispatching;
using Microsoft.Windows.AppLifecycle;

namespace MuffinTranscriber;

public static class SingleInstanceProgram
{
    [STAThread]
    static void Main(string[] args)
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();

        var mainInstance = AppInstance.FindOrRegisterForKey("main");
        var activatedEventArgs = AppInstance.GetCurrent().GetActivatedEventArgs();

        if (!mainInstance.IsCurrent)
        {
            // Redirect the activation (e.g. ShareTarget) to the existing instance
            mainInstance.RedirectActivationToAsync(activatedEventArgs).AsTask().Wait();
            return;
        }

        // We are the main instance. Start the app.
        Microsoft.UI.Xaml.Application.Start((p) =>
        {
            var context = new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread());
            SynchronizationContext.SetSynchronizationContext(context);
            new App();
        });
    }
}
