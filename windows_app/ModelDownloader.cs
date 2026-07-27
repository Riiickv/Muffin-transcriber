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
        CancellationToken ct)
    {
        // Download beside the target and only move it into place once it is
        // whole. The file is pre-allocated to its final size and filled by eight
        // parallel writers, so an interrupted download used to leave a full-size
        // file of zeros sitting exactly where a working model belongs; the app
        // called that installed and every engine call failed cryptically.
        string partial = destination + ".part";
        try
        {
            await DownloadToAsync(model, partial, progress, ct);
            File.Move(partial, destination, overwrite: true);
        }
        catch
        {
            try { if (File.Exists(partial)) File.Delete(partial); } catch { }
            throw;
        }
    }

    private static async Task DownloadToAsync(
        ModelInfo model,
        string destination,
        IProgress<(long downloaded, long total, double speed, TimeSpan? eta)> progress,
        CancellationToken ct)
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

            await using FileStream target = new(destination, FileMode.Create, FileAccess.Write, FileShare.None);
            target.SetLength(totalBytes);

            var tasks = new List<Task>();
            for (int i = 0; i < maxConnections; i++)
            {
                long start = i * chunkSize;
                long end = (i == maxConnections - 1) ? totalBytes - 1 : (start + chunkSize - 1);

                tasks.Add(Task.Run(async () =>
                {
                    using var request = new HttpRequestMessage(HttpMethod.Get, model.Url);
                    request.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(start, end);
                    using HttpResponseMessage response = await SharedHttpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
                    response.EnsureSuccessStatusCode();

                    await using Stream source = await response.Content.ReadAsStreamAsync(ct);
                    byte[] buffer = new byte[1024 * 64];
                    long currentOffset = start;
                    int read;

                    while ((read = await source.ReadAsync(buffer, ct)) > 0)
                    {
                        RandomAccess.Write(target.SafeFileHandle, buffer.AsSpan(0, read), currentOffset);
                        currentOffset += read;
                        Interlocked.Add(ref downloaded, read);
                    }
                }, ct));
            }

            await Task.WhenAll(tasks);
        }
        finally
        {
            reportCts.Cancel();
        }
    }
}
