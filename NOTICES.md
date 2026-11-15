# Third-Party Notices

Muffin is built on top of several open-source projects and bundles or invokes their binaries. Their license texts and source URLs are reproduced here.

## whisper.cpp
- Project: https://github.com/ggerganov/whisper.cpp
- License: MIT

## llama.cpp
- Project: https://github.com/ggerganov/llama.cpp
- License: MIT

## FFmpeg
- Project: https://ffmpeg.org
- License: LGPL v2.1+ (the LGPL build is recommended for redistribution; the GPL build has additional restrictions)
- Source code for the LGPL build is available from https://ffmpeg.org/download.html

## NAudio
- Project: https://github.com/naudio/NAudio
- License: MIT

## Microsoft.WindowsAppSDK / CommunityToolkit.WinUI
- License: MIT

## Models

Model weights are downloaded on demand and remain subject to the licenses they ship under:

- Whisper (`ggml-*.bin`) - MIT (OpenAI / ggerganov hosted mirror)
- Parakeet TDT 0.6B v3 (`ggml-parakeet-*.bin`) - [CC BY 4.0](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3), by NVIDIA (converted files hosted by ggml-org)
- Llama 3.2 - [Llama 3.2 Community License](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct/blob/main/LICENSE.txt)
- Qwen 2.5 - [Apache 2.0](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE)
- Phi-3 - [MIT](https://huggingface.co/microsoft/Phi-3-mini-4k-instruct/blob/main/LICENSE)
- Multilingual E5 small (`multilingual-e5-small-*.gguf`) - [MIT](https://huggingface.co/intfloat/multilingual-e5-small) (converted file hosted by TwinSunsLLC)

End users are responsible for complying with each model's license for their intended use.
