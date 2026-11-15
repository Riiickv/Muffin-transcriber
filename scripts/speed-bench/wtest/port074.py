"""Redo the app's native whisper.rn changes on whisper.rn 0.7.4.

Usage: python -I port074.py <path to node_modules/whisper.rn>
Every edit asserts its anchor is found exactly once, so a changed upstream file
fails loudly instead of being half patched.
"""
import io, sys

root = sys.argv[1]


def edit(rel, pairs):
    p = root + '/' + rel
    s = io.open(p, encoding='utf-8', newline='').read()
    for a, b in pairs:
        twice = b.replace(a, b)
        if twice != b and twice in s:
            s = s.replace(twice, b)  # an earlier run applied it twice
            print('  de-duplicated one edit in', rel)
            continue
        if b in s:
            continue  # already applied
        assert s.count(a) == 1, (rel, s.count(a), a[:70])
        s = s.replace(a, b)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('ok', rel)


edit('android/src/main/CMakeLists.txt', [(
    '    build_library("rnwhisper_v8fp16_va_2" "arm" "-march=armv8.2-a+fp16")\n',
    '    # dotprod/i8mm variants activate ggml\'s repacked Q4/Q8 kernels (the\n'
    '    # repack.cpp sources are already compiled in; without these -march flags\n'
    '    # they are dead code). Mirrors llama.rn\'s variant set.\n'
    '    build_library("rnwhisper_v8fp16_dotprod_i8mm" "arm" "-march=armv8.2-a+fp16+dotprod+i8mm")\n'
    '    build_library("rnwhisper_v8fp16_dotprod" "arm" "-march=armv8.2-a+fp16+dotprod")\n'
    '    build_library("rnwhisper_v8fp16_va_2" "arm" "-march=armv8.2-a+fp16")\n',
)])

edit('android/src/main/java/com/rnwhisper/RNWhisper.java', [(
    '    boolean hasFp16 = cpuFeatures.contains("fp16") || cpuFeatures.contains("fphp");\n',
    '    boolean hasFp16 = cpuFeatures.contains("fp16") || cpuFeatures.contains("fphp");\n'
    '    boolean hasDotProd = cpuFeatures.contains("dotprod") || cpuFeatures.contains("asimddp");\n'
    '    boolean hasI8mm = cpuFeatures.contains("i8mm");\n',
), (
    '        if (hasFp16 && tryLoadLibrary("rnwhisper_v8fp16_va_2")) {\n',
    '        if (hasFp16 && hasDotProd && hasI8mm && tryLoadLibrary("rnwhisper_v8fp16_dotprod_i8mm")) {\n'
    '          libsLoaded = true;\n'
    '          return true;\n'
    '        }\n'
    '\n'
    '        if (hasFp16 && hasDotProd && tryLoadLibrary("rnwhisper_v8fp16_dotprod")) {\n'
    '          libsLoaded = true;\n'
    '          return true;\n'
    '        }\n'
    '\n'
    '        if (hasFp16 && tryLoadLibrary("rnwhisper_v8fp16_va_2")) {\n',
)])

VAD_BLOCK = '''
    // Voice Activity Detection, run by whisper itself on the samples it has
    // already decoded into memory. whisper_full_params has carried vad,
    // vad_model_path and vad_params for a long time and this binding never read
    // them, so silence removal had to be done in JS at the cost of reading the
    // file three times. Opt-in by path: absent or empty means no VAD.
    config.vadModelPath = getStringProperty(runtime, options, "vadModelPath");
    if (!config.vadModelPath.empty()) {
        config.params.vad = true;
        config.params.vad_model_path = config.vadModelPath.c_str();
        config.params.vad_params.threshold =
            getFloatProperty(runtime, options, "vadThreshold",
                             config.params.vad_params.threshold);
        config.params.vad_params.min_speech_duration_ms =
            getIntProperty(runtime, options, "vadMinSpeechDurationMs",
                           config.params.vad_params.min_speech_duration_ms);
        config.params.vad_params.min_silence_duration_ms =
            getIntProperty(runtime, options, "vadMinSilenceDurationMs",
                           config.params.vad_params.min_silence_duration_ms);
        config.params.vad_params.max_speech_duration_s =
            getFloatProperty(runtime, options, "vadMaxSpeechDurationS",
                             config.params.vad_params.max_speech_duration_s);
        config.params.vad_params.speech_pad_ms =
            getIntProperty(runtime, options, "vadSpeechPadMs",
                           config.params.vad_params.speech_pad_ms);
        config.params.vad_params.samples_overlap =
            getFloatProperty(runtime, options, "vadSamplesOverlap",
                             config.params.vad_params.samples_overlap);
    }
'''

edit('cpp/jsi/RNWhisperJSI.cpp', [(
    '    std::string prompt;\n    std::string language;\n    int nProcessors = 1;\n',
    '    std::string prompt;\n    std::string language;\n'
    '    // Owns the storage params.vad_model_path points at, like the two above.\n'
    '    std::string vadModelPath;\n    int nProcessors = 1;\n',
), (
    '        if (!language.empty()) {\n            params.language = language.c_str();\n        }\n    }\n};\n',
    '        if (!language.empty()) {\n            params.language = language.c_str();\n        }\n'
    '        if (!vadModelPath.empty()) {\n            params.vad_model_path = vadModelPath.c_str();\n        }\n    }\n};\n',
), (
    '        getIntProperty(runtime, options, "duration", config.params.duration_ms);\n    config.params.thold_pt =',
    '        getIntProperty(runtime, options, "duration", config.params.duration_ms);\n'
    '    // Encoder context override (0 = whisper default of 1500). 0.7.4 reads this\n'
    '    // for Parakeet only; the app passes it for Whisper too (currently always 0).\n'
    '    config.params.audio_ctx =\n'
    '        getIntProperty(runtime, options, "audioCtx", config.params.audio_ctx);\n' + VAD_BLOCK + '    config.params.thold_pt =',
)])

DETECT_OLD = '''    // auto-detect language if not specified
    if (params.language == nullptr || strlen(params.language) == 0 || strcmp(params.language, "auto") == 0 || params.detect_language) {
        std::vector<float> probs(whisper_lang_max_id() + 1, 0.0f);

        const auto lang_id = whisper_lang_auto_detect_with_state(ctx, state, 0, params.n_threads, probs.data());
        if (lang_id < 0) {
            WHISPER_LOG_ERROR("%s: failed to auto-detect language\\n", __func__);
            return -3;
        }
        state->lang_id = lang_id;
        params.language = whisper_lang_str(lang_id);
'''
DETECT_NEW = '''    // [muffin] Language detection runs the encoder on the window at offset 0,
    // and the main loop below then encodes that same window again before
    // decoding it. The encoder is the expensive half of whisper, so on a clip
    // of up to 30 s auto-detect costs the whole recording twice. When this is
    // true, the encoder output and cross-attention cache still in `state` are
    // exactly what the first loop iteration would recompute, so it is skipped.
    // Same mel, same offset, same audio context: the result cannot differ.
    bool enc_reuse_ok = false;

    // auto-detect language if not specified
    if (params.language == nullptr || strlen(params.language) == 0 || strcmp(params.language, "auto") == 0 || params.detect_language) {
        std::vector<float> probs(whisper_lang_max_id() + 1, 0.0f);

        // the detection pass encodes with whatever context the state was left
        // with; exp_n_audio_ctx is only updated from params further down
        const int detect_audio_ctx = state->exp_n_audio_ctx;

        const auto lang_id = whisper_lang_auto_detect_with_state(ctx, state, 0, params.n_threads, probs.data());
        if (lang_id < 0) {
            WHISPER_LOG_ERROR("%s: failed to auto-detect language\\n", __func__);
            return -3;
        }
        state->lang_id = lang_id;
        params.language = whisper_lang_str(lang_id);
        enc_reuse_ok = (detect_audio_ctx == params.audio_ctx);
'''
ENCODE_OLD = '''        // encode audio features starting at offset seek
        if (!whisper_encode_internal(*ctx, *state, seek, params.n_threads, params.abort_callback, params.abort_callback_user_data)) {
            WHISPER_LOG_ERROR("%s: failed to encode\\n", __func__);
            return -6;
        }
'''
ENCODE_NEW = '''        // encode audio features starting at offset seek
        // [muffin] unless language detection has just encoded this very window
        const bool reuse_detect_encode = enc_reuse_ok && seek == 0;
        enc_reuse_ok = false;
        if (reuse_detect_encode) {
            WHISPER_LOG_INFO("%s: reusing the language detection encoder pass\\n", __func__);
        } else if (!whisper_encode_internal(*ctx, *state, seek, params.n_threads, params.abort_callback, params.abort_callback_user_data)) {
            WHISPER_LOG_ERROR("%s: failed to encode\\n", __func__);
            return -6;
        }
'''
edit('cpp/whisper.cpp', [(DETECT_OLD, DETECT_NEW), (ENCODE_OLD, ENCODE_NEW)])
