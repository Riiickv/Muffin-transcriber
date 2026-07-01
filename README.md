# AI Transcriber

A private, local-first Windows transcriber. Drag an audio or video file (or record from your mic) and get an accurate transcript powered by [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Optionally clean it up and summarize it with a small local LLM via [llama.cpp](https://github.com/ggerganov/llama.cpp) — nothing leaves your machine.

> Built with WinUI 3 + .NET 10. No cloud APIs, no telemetry, no subscriptions.

## Features

- **Local transcription** with Whisper (tiny → large-v3)
- **Local LLM cleanup** that adds punctuation, paragraphs, and corrects Whisper hallucinations (Llama 3.2 3B, Qwen 2.5 1.5B, or Phi-3 Mini)
- **Local summarization** of long transcripts
- **Microphone recording** with live audio visualizer
- **Drag-and-drop** + Windows **Share Target** (right-click → Share → AI Transcriber from any file)
- **Subtitle export** (`.srt` / `.vtt`) for transcribed videos
- **History** with content-hash deduping
- **Optional context learning** — extracts domain jargon from past transcripts to improve future ones (toggleable)
- Custom system prompts for the formatter and summarizer

## Project layout

```
.
├── windows_app/        WinUI 3 app source
├── ffmpeg_bin/         FFmpeg binaries (not in repo — see below)
├── whisper_bin/        whisper.cpp CLI (not in repo — see below)
├── llama_bin/          llama.cpp CLI (not in repo — see below)
└── models/             Downloaded model weights (managed by the app)
```

## Building from source

### Prerequisites
- Windows 10 1809+ / Windows 11
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- A C++ desktop workload for Visual Studio (only needed for WinUI tooling)

### Native dependencies

The app shells out to three CLI executables that are not redistributed in this repository (so the source tree stays small and the licensing stays clean). Download or build them yourself and drop them into the matching folders:

| Folder         | What to put in it                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `whisper_bin/` | `whisper-cli.exe` from [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases)     |
| `llama_bin/`   | `llama-cli.exe` from [llama.cpp releases](https://github.com/ggerganov/llama.cpp/releases)           |
| `ffmpeg_bin/`  | `ffmpeg.exe` from [ffmpeg.org](https://ffmpeg.org/download.html) (LGPL build recommended)            |

If you want GPU acceleration, use the CUDA / Vulkan builds and place their accompanying DLLs next to the exe.

The model weights themselves are downloaded on demand from inside the app's **Models** page.

### Build

```powershell
cd windows_app
dotnet restore
dotnet build -c Release
```

To produce a standalone release folder:

```powershell
dotnet publish -c Release -p:WindowsPackageType=None -p:WindowsAppSDKSelfContained=true -r win-x64 -o publish
```

## Models

Downloaded into `%LOCALAPPDATA%\AITranscriber\models\`:

| Type      | Model                | Size    | Approx VRAM |
| --------- | -------------------- | ------- | ----------- |
| Whisper   | tiny                 | 74 MB   | ~1 GB       |
| Whisper   | base                 | 142 MB  | ~1.5 GB     |
| Whisper   | small                | 466 MB  | ~2.5 GB     |
| Whisper   | large-v3             | 2.9 GB  | ~5 GB       |
| Formatter | Llama 3.2 3B Q4_K_M  | 2.0 GB  | ~3.2 GB     |
| Formatter | Qwen 2.5 1.5B Q4_K_M | 1.1 GB  | ~1.2 GB     |
| Formatter | Phi-3 Mini 3.8B Q4   | 2.4 GB  | ~2.4 GB     |

## Privacy

Everything runs locally. The only network traffic is:
- Downloading model weights from Hugging Face (on user request, from the Models page)

There is no telemetry, no analytics, no account, no cloud sync.

## License

MIT — see [LICENSE](LICENSE).

Third-party components are credited in [NOTICES.md](NOTICES.md).
