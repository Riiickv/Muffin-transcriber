using System;
using System.Runtime.InteropServices;

namespace MuffinTranscriber;

/// <summary>
/// How much model this PC can actually carry, the desktop counterpart of the
/// mobile utils/deviceTier.ts.
///
/// RAM, not CPU, for the same reason: a model is loaded whole into memory with
/// its KV cache on top, and a machine that cannot hold it does not run it
/// slowly, it fails to load it at all. CPU only decides how long you wait.
///
/// The thresholds are higher than the phone's because a desktop shares its RAM
/// with a browser and everything else the user has open, and being pointed at a
/// model that then fails is worse than a smaller one that works.
/// </summary>
public static class DeviceTier
{
    public enum Tier { Low, Mid, High }

    public enum Group { Whisper, Formatter, Embedding }

    private const double GB = 1024d * 1024d * 1024d;

    public static double TotalMemoryGB { get; } = ReadTotalMemoryGB();

    public static Tier Current { get; } =
        TotalMemoryGB >= 15.5 ? Tier.High :
        TotalMemoryGB >= 7.5 ? Tier.Mid :
        Tier.Low;

    /// <summary>
    /// The heaviest model in a group this machine should be pointed at.
    /// Hand-written per group rather than derived from file size: what matters
    /// is peak RAM while running, which is the weights plus the context, and
    /// those do not scale together.
    /// </summary>
    public static string? RecommendedFile(Group group) => group switch
    {
        Group.Embedding => "all-MiniLM-L6-v2-q4_k_m.gguf",
        Group.Whisper => Current switch
        {
            // Turbo, not large-v3, on a machine that can hold it: near enough
            // the same accuracy for a fraction of the wait, which is the trade
            // a desktop should make and a phone cannot.
            Tier.High => "ggml-large-v3-turbo.bin",
            Tier.Mid => "ggml-small.bin",
            _ => "ggml-base.bin",
        },
        _ => RecommendedFormatter(),
    };

    /// <summary>
    /// The formatter is the one the graphics card decides.
    ///
    /// llama.cpp offloads its layers to the GPU, so what a machine can run is
    /// governed by VRAM, not by system RAM: a 32 GB PC with onboard graphics
    /// should be nowhere near a 32B model, and a 16 GB PC with a 5090 should
    /// not be handed a 3B. The weights are the floor and the context sits on
    /// top, so each threshold leaves headroom rather than matching the file.
    ///
    /// With no card worth using, it falls back to the RAM tiers, which is what
    /// a CPU-only run is limited by.
    /// </summary>
    private static string? RecommendedFormatter()
    {
        double vram = VideoMemoryGB;
        if (vram >= 22) return "Qwen2.5-32B-Instruct-Q4_K_M.gguf";
        if (vram >= 11) return "Qwen2.5-14B-Instruct-Q4_K_M.gguf";
        if (vram >= 6.5) return "Qwen2.5-7B-Instruct-Q4_K_M.gguf";

        return Current switch
        {
            Tier.High => "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            Tier.Mid => "Phi-3-mini-4k-instruct-q4.gguf",
            _ => "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        };
    }

    /// <summary>
    /// Dedicated video memory of the biggest adapter, in GB, or 0 if it cannot
    /// be read.
    ///
    /// From the display driver's registry key rather than WMI: Win32_Video-
    /// Controller.AdapterRAM is a 32 bit field, so it reports 4 GB for anything
    /// larger and would put a 5090 in the same bracket as an old laptop chip.
    /// qwMemorySize is 64 bit and correct.
    /// </summary>
    public static double VideoMemoryGB { get; } = ReadVideoMemoryGB();

    private const string DisplayClassKey =
        @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    private static double ReadVideoMemoryGB()
    {
        try
        {
            using Microsoft.Win32.RegistryKey? root =
                Microsoft.Win32.Registry.LocalMachine.OpenSubKey(DisplayClassKey);
            if (root is null) return 0;

            long best = 0;
            foreach (string name in root.GetSubKeyNames())
            {
                // The class key also holds Configuration/Properties subkeys;
                // only the numbered ones are adapters.
                if (name.Length != 4 || !int.TryParse(name, out _)) continue;

                using Microsoft.Win32.RegistryKey? adapter = root.OpenSubKey(name);
                object? value = adapter?.GetValue("HardwareInformation.qwMemorySize");
                if (value is long bytes && bytes > best) best = bytes;
            }
            return best / GB;
        }
        catch
        {
            // No card, no permission, a driver that does not publish it: the
            // caller falls back to the RAM tiers.
            return 0;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhys;
        public ulong AvailPhys;
        public ulong TotalPageFile;
        public ulong AvailPageFile;
        public ulong TotalVirtual;
        public ulong AvailVirtual;
        public ulong AvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx buffer);

    private static double ReadTotalMemoryGB()
    {
        try
        {
            var status = new MemoryStatusEx();
            status.Length = (uint)Marshal.SizeOf<MemoryStatusEx>();
            if (GlobalMemoryStatusEx(ref status)) return status.TotalPhys / GB;
        }
        catch
        {
            // Unknown memory assumes the weakest machine, same as on mobile.
        }

        return 0;
    }
}
