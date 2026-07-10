using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MuffinTranscriber;

// Generates sentence embeddings by running the bundled llama-server in embedding
// mode and calling its HTTP endpoint. Everything degrades to null on failure, so
// chat falls back to keyword search and nothing breaks if the model is absent.
public static class EmbeddingService
{
    private static readonly SemaphoreSlim _gate = new(1, 1);
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(30) };
    private static Process? _server;
    private static int _port;
    private static bool _failed; // once the server can't start, stop retrying this session

    public static bool ModelInstalled =>
        !string.IsNullOrWhiteSpace(AppModel.LlamaServerExe)
        && AppModel.EmbeddingModels.Any(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File)));

    public static async Task<double[]?> EmbedAsync(string text)
    {
        if (string.IsNullOrWhiteSpace(text) || _failed || !ModelInstalled) return null;

        await _gate.WaitAsync();
        try
        {
            if (!await EnsureServerAsync()) return null;
            return await RequestEmbeddingAsync(text);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"EmbedAsync failed: {ex.Message}");
            return null;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static async Task<bool> EnsureServerAsync()
    {
        if (_server is { HasExited: false }) return true;

        ModelInfo? model = AppModel.EmbeddingModels.FirstOrDefault(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File)));
        if (model is null) { _failed = true; return false; }

        _port = FreePort();
        var psi = new ProcessStartInfo
        {
            FileName = AppModel.LlamaServerExe,
            Arguments = $"-m \"{AppModel.ModelPath(model.File)}\" --embedding --pooling mean --host 127.0.0.1 --port {_port} -ngl 999 -c 512 --log-disable",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        try
        {
            _server = Process.Start(psi);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Embedding server failed to start: {ex.Message}");
            _failed = true;
            return false;
        }

        if (_server is null) { _failed = true; return false; }

        // Drain the pipes so a full buffer can't stall the server.
        _ = _server.StandardOutput.ReadToEndAsync();
        _ = _server.StandardError.ReadToEndAsync();

        // Wait for /health (up to ~40s while the model loads).
        for (int i = 0; i < 80; i++)
        {
            if (_server.HasExited) { _failed = true; return false; }
            try
            {
                using HttpResponseMessage health = await _http.GetAsync($"http://127.0.0.1:{_port}/health");
                if (health.IsSuccessStatusCode) return true;
            }
            catch { }
            await Task.Delay(500);
        }

        _failed = true;
        Shutdown();
        return false;
    }

    private static async Task<double[]?> RequestEmbeddingAsync(string text)
    {
        // OpenAI-compatible endpoint first.
        try
        {
            using HttpResponseMessage resp = await _http.PostAsJsonAsync($"http://127.0.0.1:{_port}/v1/embeddings", new { input = text });
            if (resp.IsSuccessStatusCode)
            {
                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                if (doc.RootElement.TryGetProperty("data", out JsonElement data) && data.GetArrayLength() > 0
                    && data[0].TryGetProperty("embedding", out JsonElement emb))
                {
                    return ToArray(emb);
                }
            }
        }
        catch { }

        // Native llama.cpp endpoint as a fallback.
        try
        {
            using HttpResponseMessage resp = await _http.PostAsJsonAsync($"http://127.0.0.1:{_port}/embedding", new { content = text });
            if (resp.IsSuccessStatusCode)
            {
                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                JsonElement root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0) root = root[0];
                if (root.TryGetProperty("embedding", out JsonElement emb)) return ToArray(emb);
            }
        }
        catch { }

        return null;
    }

    private static double[]? ToArray(JsonElement emb)
    {
        if (emb.ValueKind != JsonValueKind.Array) return null;
        // Some builds nest the vector as [[...]]; unwrap one level.
        if (emb.GetArrayLength() > 0 && emb[0].ValueKind == JsonValueKind.Array) emb = emb[0];

        var values = new List<double>(emb.GetArrayLength());
        foreach (JsonElement v in emb.EnumerateArray())
        {
            if (v.ValueKind == JsonValueKind.Number) values.Add(v.GetDouble());
        }
        return values.Count > 0 ? values.ToArray() : null;
    }

    public static double CosineSimilarity(double[] a, double[] b)
    {
        if (a.Length == 0 || a.Length != b.Length) return 0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return (na == 0 || nb == 0) ? 0 : dot / (Math.Sqrt(na) * Math.Sqrt(nb));
    }

    private static int FreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    public static void Shutdown()
    {
        try { if (_server is { HasExited: false }) _server.Kill(entireProcessTree: true); }
        catch { }
        _server = null;
    }
}
