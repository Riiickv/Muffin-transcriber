// Desktop check for the Auto-Detect encoder reuse patch.
// Usage: wtest <model> <wav 16 kHz mono 16-bit> <language|auto> <threads> <out txt>
// Decodes like the app does (beam 1, best-of 1, no_context), writes the text to
// <out txt> and prints the wall time of whisper_full and the detected language.
#include "whisper.h"

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

static bool read_wav(const char *path, std::vector<float> &pcm) {
    FILE *f = fopen(path, "rb");
    if (!f) return false;
    std::vector<uint8_t> buf;
    uint8_t tmp[65536];
    size_t n;
    while ((n = fread(tmp, 1, sizeof(tmp), f)) > 0) buf.insert(buf.end(), tmp, tmp + n);
    fclose(f);
    size_t pos = 12;
    while (pos + 8 <= buf.size()) {
        uint32_t size;
        memcpy(&size, &buf[pos + 4], 4);
        if (memcmp(&buf[pos], "data", 4) == 0) {
            size_t end = pos + 8 + size;
            if (end > buf.size()) end = buf.size();
            for (size_t i = pos + 8; i + 1 < end; i += 2) {
                int16_t s;
                memcpy(&s, &buf[i], 2);
                pcm.push_back(s / 32768.0f);
            }
            return true;
        }
        pos += 8 + size + (size & 1);
    }
    return false;
}

int main(int argc, char **argv) {
    if (argc < 6) {
        fprintf(stderr, "usage: wtest model wav lang threads out\n");
        return 2;
    }
    std::vector<float> pcm;
    if (!read_wav(argv[2], pcm)) {
        fprintf(stderr, "cannot read wav\n");
        return 3;
    }
    whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false;
    whisper_context *ctx = whisper_init_from_file_with_params(argv[1], cparams);
    if (!ctx) return 4;

    whisper_full_params p = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH);
    p.beam_search.beam_size = 1;
    p.greedy.best_of = 1;
    p.language = argv[3];
    p.translate = false;
    p.n_threads = atoi(argv[4]);
    p.no_context = true;
    p.print_progress = false;
    p.print_realtime = false;
    p.print_timestamps = false;
    p.print_special = false;

    const auto t0 = std::chrono::steady_clock::now();
    const int rc = whisper_full(ctx, p, pcm.data(), (int) pcm.size());
    const auto t1 = std::chrono::steady_clock::now();
    if (rc != 0) {
        fprintf(stderr, "whisper_full failed: %d\n", rc);
        return 5;
    }
    std::string text;
    const int n = whisper_full_n_segments(ctx);
    for (int i = 0; i < n; i++) {
        text += whisper_full_get_segment_text(ctx, i);
        text += "\n";
    }
    FILE *o = fopen(argv[5], "wb");
    fwrite(text.data(), 1, text.size(), o);
    fclose(o);
    printf("full_ms=%lld segments=%d chars=%zu lang=%s\n",
           (long long) std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count(), n, text.size(),
           whisper_lang_str(whisper_full_lang_id(ctx)));
    whisper_free(ctx);
    return 0;
}
