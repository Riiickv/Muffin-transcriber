using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace MuffinTranscriber;

/// <summary>
/// How long a model is likely to take ON THIS MACHINE.
///
/// Desktops are not phones: the same model on a 3060 and on a laptop with no
/// graphics card at all are different by an order of magnitude, and there is no
/// one measurement to calibrate a table against the way the mobile app has one.
/// Inventing per-tier numbers here would be writing fiction and rendering it in
/// the accent colour.
///
/// So this calibrates against the user's OWN history instead. Every transcript
/// now records which model made it and how many milliseconds it took, so:
///
///   * a model this PC has actually used reports its real average, and says so;
///   * a model it has not used is extrapolated from one it HAS, using the ratio
///     of encoder sizes, which is a published property of the models rather
///     than a guess about the hardware;
///   * with no history at all, there is no line. A blank is honest; a number
///     nobody measured is not.
///
/// That last case fixes itself after one transcription, which is also when the
/// answer starts being about this computer rather than about computers.
/// </summary>
public static class ModelTimeEstimate
{
    /// <summary>
    /// Encoder cost relative to tiny, from the layer counts whisper ships:
    /// tiny 4, base 6, small 12, large 32. Not a layer ratio, because width
    /// grows with depth; these follow the published relative speeds.
    ///
    /// large-v3-turbo keeps the FULL large-v3 encoder and only trims the decoder,
    /// which is why it sits with large here and not below small.
    /// </summary>
    private static readonly Dictionary<string, double> EncoderWeight = new()
    {
        ["ggml-tiny.bin"] = 1,
        ["ggml-tiny-q8_0.bin"] = 1,
        ["ggml-base.bin"] = 2,
        ["ggml-small.bin"] = 6,
        ["ggml-small-q8_0.bin"] = 6,
        ["ggml-large-v3.bin"] = 32,
        ["ggml-large-v3-turbo-q8_0.bin"] = 32,
    };

    /// <summary>Models whose filename does not state a parameter count.</summary>
    private static readonly Dictionary<string, double> KnownParams = new()
    {
        ["Phi-3-mini-4k-instruct-q4.gguf"] = 3.8,
    };

    /// <summary>Roughly how many characters of transcript a minute of speech is.</summary>
    private const double CharsPerMinute = 14 * 60;

    public sealed record Estimate(double Seconds, bool PerRecording, bool Measured);

    /// <summary>
    /// Billions of parameters from the filename, or null when it does not say.
    /// A null means no estimate at all rather than a plausible-looking default.
    /// </summary>
    public static double? BillionsOfParams(string key)
    {
        if (KnownParams.TryGetValue(key, out double known)) return known;
        var match = System.Text.RegularExpressions.Regex.Match(key, @"(\d+(?:[._]\d+)?)\s*b[-._]",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        return double.TryParse(match.Groups[1].Value.Replace('_', '.'),
            System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out double n) && n > 0
            ? n
            : null;
    }

    /// <summary>
    /// The estimate for one model, or null when nothing can honestly be said.
    /// </summary>
    public static Estimate? For(string key, List<TranscriptionHistoryItem> history)
    {
        if (EncoderWeight.TryGetValue(key, out double weight))
        {
            double? own = AverageTranscribeSeconds(key, history);
            if (own is not null) return new Estimate(own.Value, true, true);

            // Nothing for this model, but perhaps for another. One real number
            // anywhere on the ladder calibrates the whole ladder.
            foreach (var (otherKey, otherWeight) in EncoderWeight)
            {
                double? other = AverageTranscribeSeconds(otherKey, history);
                if (other is null) continue;
                return new Estimate(other.Value * (weight / otherWeight), true, false);
            }
            return null;
        }

        double? billions = BillionsOfParams(key);
        if (billions is null) return null;

        double? ownLlm = AverageLlmSecondsPerMinute(key, history);
        if (ownLlm is not null) return new Estimate(ownLlm.Value, false, true);

        foreach (var item in history)
        {
            if (item.FormatterModel is null) continue;
            double? otherB = BillionsOfParams(item.FormatterModel);
            double? otherRate = AverageLlmSecondsPerMinute(item.FormatterModel, history);
            if (otherB is null || otherRate is null || otherB.Value <= 0) continue;
            return new Estimate(otherRate.Value * (billions.Value / otherB.Value), false, false);
        }
        return null;
    }

    private static double? AverageTranscribeSeconds(string key, List<TranscriptionHistoryItem> history)
    {
        var runs = history
            .Where(h => h.WhisperModel == key && h.TranscribeMs is > 0)
            .Select(h => h.TranscribeMs!.Value / 1000.0)
            .ToList();
        return runs.Count > 0 ? runs.Average() : null;
    }

    /// <summary>
    /// Seconds per minute of transcript, averaged over the runs that recorded
    /// both a duration and enough text to divide by.
    /// </summary>
    private static double? AverageLlmSecondsPerMinute(string key, List<TranscriptionHistoryItem> history)
    {
        var rates = new List<double>();
        foreach (var item in history)
        {
            if (item.FormatterModel != key) continue;
            string text = item.RawTranscript ?? "";
            double minutes = text.Length / CharsPerMinute;
            if (minutes < 0.15) continue; // too short to divide by safely

            if (item.ImproveMs is > 0) rates.Add(item.ImproveMs!.Value / 1000.0 / minutes);
            if (item.SummarizeMs is > 0) rates.Add(item.SummarizeMs!.Value / 1000.0 / minutes);
        }
        return rates.Count > 0 ? rates.Average() : null;
    }

    /// <summary>
    /// Seconds as something short enough to sit under a model name.
    ///
    /// Rounded hard: "27.4s" claims a precision an average of three runs has
    /// not got. Never "0s", which would say the work is free.
    /// </summary>
    public static string Format(double seconds)
    {
        if (seconds < 10) return $"{Math.Max(1, Math.Round(seconds)):0}s";
        if (seconds < 90) return $"{Math.Round(seconds / 5) * 5:0}s";
        double minutes = seconds / 60;
        return minutes < 10
            ? $"{minutes.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture)}m"
            : $"{Math.Round(minutes):0}m";
    }

    /// <summary>The finished line, translated, or null when there is none.</summary>
    public static string? Line(string key, List<TranscriptionHistoryItem> history)
    {
        Estimate? e = For(key, history);
        if (e is null) return null;

        string time = Format(e.Seconds);
        string fallback = e.Measured
            ? (e.PerRecording ? "{t} per recording on this PC" : "{t} per minute of recording on this PC")
            : (e.PerRecording ? "about {t} per recording" : "about {t} per minute of recording");
        string key2 = e.Measured
            ? (e.PerRecording ? "pc.models.measuredPerRecording" : "pc.models.measuredPerMinute")
            : (e.PerRecording ? "pc.models.estimatePerRecording" : "pc.models.estimatePerMinute");

        return LocalizationManager.GetString(key2, fallback).Replace("{t}", time);
    }
}
