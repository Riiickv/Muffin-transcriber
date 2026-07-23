using System;
using System.Threading;
using Microsoft.UI.Dispatching;
using Microsoft.Windows.AppLifecycle;

namespace MuffinTranscriber;

public static class SingleInstanceProgram
{
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    private static extern uint SetErrorMode(uint uMode);
    private const uint SEM_FAILCRITICALERRORS = 0x0001;
    private const uint SEM_NOOPENFILEERRORBOX = 0x8000;

    [STAThread]
    static void Main(string[] args)
    {
        // Child processes inherit this: an engine exe with a missing DLL now
        // fails fast with STATUS_DLL_NOT_FOUND (which EngineHealth translates)
        // instead of freezing behind a modal Windows "system error" dialog.
        SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOOPENFILEERRORBOX);

        WinRT.ComWrappersSupport.InitializeComWrappers();

        var mainInstance = AppInstance.FindOrRegisterForKey("main");
        var activatedEventArgs = AppInstance.GetCurrent().GetActivatedEventArgs();

        if (!mainInstance.IsCurrent)
        {
            // Redirect the activation (e.g. ShareTarget) to the existing instance
            mainInstance.RedirectActivationToAsync(activatedEventArgs).AsTask().Wait();
            return;
        }

        Microsoft.UI.Xaml.Application.Start((p) =>
        {
            var context = new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread());
            SynchronizationContext.SetSynchronizationContext(context);
            new App();
        });
    }
}
