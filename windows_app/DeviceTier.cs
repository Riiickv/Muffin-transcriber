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
    public static string? RecommendedFile(Group group) => Current switch
    {
        Tier.High => group switch
        {
            Group.Whisper => "ggml-large-v3.bin",
            Group.Formatter => "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            _ => "all-MiniLM-L6-v2-q4_k_m.gguf",
        },
        Tier.Mid => group switch
        {
            Group.Whisper => "ggml-small.bin",
            Group.Formatter => "Phi-3-mini-4k-instruct-q4.gguf",
            _ => "all-MiniLM-L6-v2-q4_k_m.gguf",
        },
        _ => group switch
        {
            Group.Whisper => "ggml-base.bin",
            Group.Formatter => "qwen2.5-1.5b-instruct-q4_k_m.gguf",
            _ => "all-MiniLM-L6-v2-q4_k_m.gguf",
        },
    };

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
