using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace MuffinTranscriber
{
    public class GitHubRelease
    {
        [JsonPropertyName("tag_name")]
        public string TagName { get; set; } = string.Empty;

        [JsonPropertyName("assets")]
        public GitHubAsset[] Assets { get; set; } = Array.Empty<GitHubAsset>();
    }

    public class GitHubAsset
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("browser_download_url")]
        public string BrowserDownloadUrl { get; set; } = string.Empty;
    }

    public class AutoUpdater
    {
        private const string RepoApiUrl = "https://api.github.com/repos/Riiickv/Muffin-transcriber/releases/latest";
        private static readonly HttpClient _httpClient = new HttpClient();
        
        static AutoUpdater()
        {
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "MuffinTranscriber-AutoUpdater");
        }

        public static async Task<(bool UpdateAvailable, string LatestVersion, string DownloadUrl)> CheckForUpdatesAsync()
        {
            try
            {
                var response = await _httpClient.GetAsync(RepoApiUrl);
                if (!response.IsSuccessStatusCode)
                    return (false, "", "");

                var release = await response.Content.ReadFromJsonAsync<GitHubRelease>();
                if (release == null || string.IsNullOrEmpty(release.TagName))
                    return (false, "", "");

                string currentVersion = AppStrings.AppVersion;
                
                if (release.TagName.ToLower() != currentVersion.ToLower() && IsNewer(currentVersion, release.TagName))
                {
                    foreach (var asset in release.Assets)
                    {
                        if (asset.Name.Equals("Muffin_Setup.exe", StringComparison.OrdinalIgnoreCase)
                            && IsTrustedDownloadUrl(asset.BrowserDownloadUrl))
                        {
                            return (true, release.TagName, asset.BrowserDownloadUrl);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Update check failed: {ex.Message}");
            }
            return (false, "", "");
        }

        // The elevated installer is launched from whatever URL we hand back, so only
        // trust HTTPS links on GitHub's own hosts. This is defence-in-depth on top of
        // the TLS-authenticated api.github.com response the URL came from.
        private static bool IsTrustedDownloadUrl(string url)
        {
            return Uri.TryCreate(url, UriKind.Absolute, out Uri? uri)
                && uri.Scheme == Uri.UriSchemeHttps
                && (uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
                    || uri.Host.EndsWith(".github.com", StringComparison.OrdinalIgnoreCase)
                    || uri.Host.EndsWith(".githubusercontent.com", StringComparison.OrdinalIgnoreCase));
        }

        private static bool IsNewer(string currentVer, string remoteVer)
        {
            var cParts = currentVer.Replace("v", "").Split('.');
            var rParts = remoteVer.Replace("v", "").Split('.');

            for (int i = 0; i < Math.Min(cParts.Length, rParts.Length); i++)
            {
                if (int.TryParse(cParts[i], out int c) && int.TryParse(rParts[i], out int r))
                {
                    if (r > c) return true;
                    if (r < c) return false;
                }
            }
            return rParts.Length > cParts.Length;
        }

        public static async Task<string> DownloadUpdateAsync(string downloadUrl, IProgress<int> progress)
        {
            if (!IsTrustedDownloadUrl(downloadUrl))
                throw new InvalidOperationException("Refusing to download an update from an untrusted URL.");

            var tempFile = Path.Combine(Path.GetTempPath(), "Muffin_Setup_Update.exe");
            
            if (File.Exists(tempFile))
                File.Delete(tempFile);

            using var response = await _httpClient.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            var totalBytes = response.Content.Headers.ContentLength ?? -1L;
            var canReportProgress = totalBytes != -1 && progress != null;

            using var contentStream = await response.Content.ReadAsStreamAsync();
            using var fileStream = new FileStream(tempFile, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);

            var totalRead = 0L;
            var buffer = new byte[8192];
            var isMoreToRead = true;

            do
            {
                var read = await contentStream.ReadAsync(buffer, 0, buffer.Length);
                if (read == 0)
                {
                    isMoreToRead = false;
                }
                else
                {
                    await fileStream.WriteAsync(buffer, 0, read);
                    totalRead += read;

                    if (canReportProgress)
                    {
                        var percentage = (int)((totalRead * 100) / totalBytes);
                        progress!.Report(percentage);
                    }
                }
            }
            while (isMoreToRead);

            return tempFile;
        }

        // Returns false if launch failed (e.g. user cancelled the UAC prompt) so the caller
        // can recover; on success the process exits and never returns.
        public static bool InstallAndRestart(string installerPath)
        {
            var processInfo = new ProcessStartInfo
            {
                FileName = installerPath,
                Arguments = "/VERYSILENT /SUPPRESSMSGBOXES /AUTOUPDATE",
                UseShellExecute = true,
                Verb = "runas"
            };

            try
            {
                Process.Start(processInfo);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Installer launch failed/cancelled: {ex.Message}");
                return false;
            }

            Environment.Exit(0);
            return true; // unreachable
        }
    }
}
