using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace MuffinTranscriber;

// The chunked model download that used to live inside ModelsPage, extracted so
// the setup wizard can reuse it. Progress reports (downloaded, total, MB/s, eta)
// on a 500ms cadence; cancellation deletes nothing (callers own cleanup).
public static class ModelDownloader
{
    private static readonly HttpClient SharedHttpClient = new() { Timeout = Timeout.InfiniteTimeSpan };

    public static async Task DownloadAsync(
        ModelInfo model,
        string destination,
        IProgress<(long downloaded, long total, double speed, TimeSpan? eta)> progress,
        CancellationToken ct,
        bool keepPartial = false)
    {
        // Download beside the target and only move it into place once it is
        // whole. The file is pre-allocated to its final size and filled by eight
        // parallel writers, so an interrupted download used to leave a full-size
        // file of zeros sitting exactly where a working model belongs; the app
        // called that installed and every engine call failed cryptically.
        string partial = destination + ".part";
        try
        {
            await DownloadToAsync(model, partial, progress, ct, keepPartial);
            File.Move(partial, destination, overwrite: true);
            Discard(partial);
        }
        catch (OperationCanceledException) when (keepPartial)
        {
            // Paused, not cancelled. The bytes and the per-chunk offsets stay on
            // disk so resuming asks only for what is missing, which on an 18 GB
            // model is the difference between a pause and starting again.
            throw;
        }
        catch
        {
            Discard(partial);
            try { if (File.Exists(partial)) File.Delete(partial); } catch { }
            throw;
        }
    }

    /// <summary>Where a paused download's chunk offsets are kept.</summary>
    private static string StatePath(string partial) => partial + ".state";

    /// <summary>Throws away a partial download's bookkeeping.</summary>
    public static void Discard(string partial)
    {
        try { if (File.Exists(StatePath(partial))) File.Delete(StatePath(partial)); } catch { }
    }

    /// <summary>Deletes a paused download's bytes and its bookkeeping.</summary>
    public static void DiscardAll(string destination)
    {
        string partial = destination + ".part";
        Discard(partial);
        try { if (File.Exists(partial)) File.Delete(partial); } catch { }
    }

    private static long[]? ReadState(string partial, long totalBytes, int chunks)
    {
        try
        {
            if (!File.Exists(StatePath(partial)) || !File.Exists(partial)) return null;
            var info = new FileInfo(partial);
            string[] parts = File.ReadAllText(StatePath(partial)).Split(',');
            // The header line is the total, so a model whose file changed on the
            // server is downloaded again rather than stitched into nonsense.
            if (parts.Length != chunks + 1) return null;
            if (!long.TryParse(parts[0], out long savedTotal) || savedTotal != totalBytes) return null;
            if (info.Length != totalBytes) return null;

            var offsets = new long[chunks];
            for (int i = 0; i < chunks; i++)
            {
                if (!long.TryParse(parts[i + 1], out offsets[i])) return null;
            }
            return offsets;
        }
        catch
        {
            return null;
        }
    }

    private static void WriteState(string partial, long totalBytes, long[] offsets)
    {
        try
        {
            File.WriteAllText(StatePath(partial), totalBytes + "," + string.Join(",", offsets));
        }
        catch
        {
            // A pause that cannot be recorded just resumes from the beginning.
        }
    }

    private static async Task DownloadToAsync(
        ModelInfo model,
        string destination,
        IProgress<(long downloaded, long total, double speed, TimeSpan? eta)> progress,
        CancellationToken ct,
        bool keepPartial)
    {
        using HttpResponseMessage headResponse = await SharedHttpClient.GetAsync(model.Url, HttpCompletionOption.ResponseHeadersRead, ct);
        headResponse.EnsureSuccessStatusCode();

        long? totalHeader = headResponse.Content.Headers.ContentLength;
        long totalBytes = totalHeader ?? 0;
        long downloaded = 0;

        using var reportCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var reportTask = Task.Run(async () =>
        {
            long lastDownloaded = 0;
            while (!reportCts.IsCancellationRequested)
            {
                try { await Task.Delay(500, reportCts.Token); } catch { break; }
                long current = Interlocked.Read(ref downloaded);
                double speed = (current - lastDownloaded) / 1024.0 / 1024.0 / 0.5; // MB/s
                lastDownloaded = current;
                TimeSpan? eta = speed > 0 && totalBytes > 0 ? TimeSpan.FromSeconds((totalBytes - current) / 1024.0 / 1024.0 / speed) : null;
                progress.Report((current, totalBytes, speed, eta));
            }
        });

        try
        {
            if (totalHeader is null or <= 0 || headResponse.Headers.AcceptRanges?.Contains("bytes") != true)
            {
                await using Stream source = await headResponse.Content.ReadAsStreamAsync(ct);
                await using FileStream targetSeq = File.Create(destination);

                byte[] bufferSeq = new byte[1024 * 1024];
                int readSeq;
                while ((readSeq = await source.ReadAsync(bufferSeq, ct)) > 0)
                {
                    await targetSeq.WriteAsync(bufferSeq.AsMemory(0, readSeq), ct);
                    Interlocked.Add(ref downloaded, readSeq);
                }
                return;
            }

            int maxConnections = 8;
            long chunkSize = totalBytes / maxConnections;

            // Where each chunk got to last time, if this is a resume. Null
            // means start clean.
            long[]? resumeFrom = ReadState(destination, totalBytes, maxConnections);
            long[] offsets = new long[maxConnections];
            if (resumeFrom is not null)
            {
                Array.Copy(resumeFrom, offsets, maxConnections);
                long already = 0;
                for (int i = 0; i < maxConnections; i++)
                {
                    already += offsets[i] - (i * chunkSize);
                }
                Interlocked.Add(ref downloaded, already);
            }

            // FileOptions.Asynchronous, so the handle does overlapped I/O and
            // the writes below can be awaited instead of blocking.
            // OpenOrCreate on a resume: the bytes already fetched are in there,
            // and Create would truncate them away.
            await using FileStream target = new(
                destination,
                resumeFrom is null ? FileMode.Create : FileMode.OpenOrCreate,
                FileAccess.Write, FileShare.None,
                bufferSize: 1, FileOptions.Asynchronous);
            if (target.Length != totalBytes) target.SetLength(totalBytes);

            var tasks = new List<Task>();
            for (int i = 0; i < maxConnections; i++)
            {
                int index = i;
                long start = i * chunkSize;
                long end = (i == maxConnections - 1) ? totalBytes - 1 : (start + chunkSize - 1);
                if (resumeFrom is null) offsets[index] = start;
                long from = offsets[index];
                if (from > end) continue; // this chunk finished before the pause

                tasks.Add(Task.Run(async () =>
                {
                    using var request = new HttpRequestMessage(HttpMethod.Get, model.Url);
                    request.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(from, end);
                    using HttpResponseMessage response = await SharedHttpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
                    response.EnsureSuccessStatusCode();

                    await using Stream source = await response.Content.ReadAsStreamAsync(ct);
                    // 1 MB, not 64 KB: a 18 GB model is 280,000 round trips at
                    // the smaller size, and every one of them was a blocking
                    // write.
                    byte[] buffer = new byte[1024 * 1024];
                    long currentOffset = from;
                    int read;

                    while ((read = await source.ReadAsync(buffer, ct)) > 0)
                    {
                        // WriteAsync, NOT RandomAccess.Write. The synchronous
                        // one blocks the thread it runs on, and these are eight
                        // thread pool threads writing flat out. The pool is the
                        // same one the bridge, the progress reports and every
                        // await in the app run on, so downloading a model
                        // starved the entire UI: the pool only grows about a
                        // thread a second, and eight were permanently stuck.
                        // That is why the app crawled while a model came down.
                        await RandomAccess.WriteAsync(target.SafeFileHandle, buffer.AsMemory(0, read), currentOffset, ct);
                        currentOffset += read;
                        // Published after the write, never before: a number
                        // ahead of the bytes would resume past a gap.
                        Volatile.Write(ref offsets[index], currentOffset);
                        Interlocked.Add(ref downloaded, read);
                    }
                }, ct));
            }

            try
            {
                await Task.WhenAll(tasks);
            }
            catch (OperationCanceledException) when (keepPartial)
            {
                // Flush the handle before recording where each chunk got to, or
                // the offsets would promise bytes that never reached the disk.
                await target.FlushAsync(CancellationToken.None);
                WriteState(destination, totalBytes, offsets);
                throw;
            }
        }
        finally
        {
            reportCts.Cancel();
        }
    }
}
