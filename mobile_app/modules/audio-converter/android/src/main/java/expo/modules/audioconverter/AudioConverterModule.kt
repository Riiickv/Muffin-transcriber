package expo.modules.audioconverter

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt

/**
 * Expo native module that converts any audio/video file Android can decode
 * into a 16 kHz, 16-bit, mono PCM WAV file — the format whisper.rn expects.
 *
 * Leverages MediaExtractor + MediaCodec (hardware-accelerated where available)
 * so every codec the device supports (MP3, AAC/M4A, OGG Vorbis/Opus, FLAC,
 * AMR, MP4 audio tracks, etc.) works without bundling FFmpeg.
 *
 * This implementation uses a streaming architecture: decoded PCM is downmixed
 * and resampled in chunks as it comes out of MediaCodec, then written directly
 * to the output WAV file. This avoids buffering the entire decoded audio in RAM
 * (which could be ~100 MB+ for a 10-minute stereo 44.1 kHz file).
 */
class AudioConverterModule : Module() {

    override fun definition() = ModuleDefinition {
        Name("AudioConverter")

        AsyncFunction("convertToWav") { inputPath: String, outputPath: String ->
            convertAudioToWav(inputPath, outputPath)
            return@AsyncFunction outputPath
        }
    }

    // -------------------------------------------------------------------------
    // Core conversion pipeline (streaming)
    // -------------------------------------------------------------------------

    private fun convertAudioToWav(rawInputPath: String, rawOutputPath: String) {
        val inputPath = stripFileScheme(rawInputPath)
        val outputPath = stripFileScheme(rawOutputPath)

        // Ensure the output directory exists.
        File(outputPath).parentFile?.mkdirs()

        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(inputPath)
        } catch (e: Exception) {
            throw Exception("Cannot open audio file: ${e.message}")
        }

        // Locate the first audio track.
        var trackIndex = -1
        var format: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val tf = extractor.getTrackFormat(i)
            val mime = tf.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("audio/")) {
                trackIndex = i
                format = tf
                break
            }
        }
        if (trackIndex == -1 || format == null) {
            extractor.release()
            throw Exception("No audio track found in file")
        }

        extractor.selectTrack(trackIndex)

        val mime = format.getString(MediaFormat.KEY_MIME)!!
        val srcRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val srcChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        val needsDownmix = srcChannels > 1
        val needsResample = srcRate != TARGET_RATE

        // Set up the decoder.
        val codec = MediaCodec.createDecoderByType(mime)
        codec.configure(format, null, null, 0)
        codec.start()

        // Open output file and write a placeholder WAV header (44 bytes).
        // We'll patch the data size fields after we know the total sample count.
        val raf = RandomAccessFile(File(outputPath), "rw")
        raf.setLength(0)
        val headerPlaceholder = ByteArray(44)
        raf.write(headerPlaceholder)

        val info = MediaCodec.BufferInfo()
        var inputDone = false
        var outputDone = false
        // Track the actual output PCM encoding (some decoders output float).
        var outputIsFloat = false

        // Resampler state — carried across chunks for continuity.
        var resamplerSrcPos = 0.0
        var totalSamplesWritten = 0L

        // Reusable write buffer to avoid per-chunk allocations.
        val writeBuf = ByteBuffer.allocate(32768).order(ByteOrder.LITTLE_ENDIAN)

        while (!outputDone) {
            // ---------- feed compressed data into the decoder ----------
            if (!inputDone) {
                val inIdx = codec.dequeueInputBuffer(10_000)
                if (inIdx >= 0) {
                    val buf = codec.getInputBuffer(inIdx)!!
                    val read = extractor.readSampleData(buf, 0)
                    if (read < 0) {
                        codec.queueInputBuffer(
                            inIdx, 0, 0, 0,
                            MediaCodec.BUFFER_FLAG_END_OF_STREAM
                        )
                        inputDone = true
                    } else {
                        codec.queueInputBuffer(
                            inIdx, 0, read,
                            extractor.sampleTime, 0
                        )
                        extractor.advance()
                    }
                }
            }

            // ---------- drain decoded PCM from the decoder ----------
            val outIdx = codec.dequeueOutputBuffer(info, 10_000)
            when {
                outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    // Check if the decoder's actual output is float PCM.
                    val outFmt = codec.outputFormat
                    val enc = outFmt.getIntegerOrDefault(
                        MediaFormat.KEY_PCM_ENCODING,
                        android.media.AudioFormat.ENCODING_PCM_16BIT
                    )
                    outputIsFloat =
                        enc == android.media.AudioFormat.ENCODING_PCM_FLOAT
                }
                outIdx >= 0 -> {
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        outputDone = true
                    }
                    if (info.size > 0) {
                        val outBuf = codec.getOutputBuffer(outIdx)!!
                        outBuf.position(info.offset)
                        outBuf.limit(info.offset + info.size)

                        // Convert this chunk to int16 mono samples.
                        val chunkSamples: ShortArray = if (outputIsFloat) {
                            floatBufToShorts(outBuf)
                        } else {
                            byteBufToShorts(outBuf, info.size)
                        }

                        // Downmix to mono if needed.
                        val mono = if (needsDownmix) {
                            downmixToMono(chunkSamples, srcChannels)
                        } else {
                            chunkSamples
                        }

                        // Resample to 16 kHz if needed, then write to file.
                        if (needsResample) {
                            val ratio = srcRate.toDouble() / TARGET_RATE
                            val monoLen = mono.size
                            // Calculate how many output samples this chunk produces.
                            val startOutIdx = (resamplerSrcPos / ratio).toInt()
                            // The end of this chunk in source-sample space.
                            val chunkEnd = resamplerSrcPos + monoLen
                            val endOutIdx = (chunkEnd / ratio).toInt()

                            writeBuf.clear()
                            for (oi in startOutIdx until endOutIdx) {
                                val srcPosAbs = oi * ratio
                                val localPos = srcPosAbs - resamplerSrcPos
                                val idx = localPos.toInt()
                                val frac = (localPos - idx).toFloat()
                                val a = if (idx in mono.indices) mono[idx] else 0
                                val b = if (idx + 1 in mono.indices) mono[idx + 1] else a
                                val sample = (a + frac * (b - a)).roundToInt()
                                    .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                                    .toShort()

                                if (writeBuf.remaining() < 2) {
                                    // Flush buffer to file.
                                    raf.write(writeBuf.array(), 0, writeBuf.position())
                                    totalSamplesWritten += writeBuf.position() / 2
                                    writeBuf.clear()
                                }
                                writeBuf.putShort(sample)
                            }
                            // Flush remaining.
                            if (writeBuf.position() > 0) {
                                raf.write(writeBuf.array(), 0, writeBuf.position())
                                totalSamplesWritten += writeBuf.position() / 2
                            }
                            resamplerSrcPos = chunkEnd
                        } else {
                            // No resampling needed — write mono samples directly.
                            val bytes = shortsToBytes(mono)
                            raf.write(bytes)
                            totalSamplesWritten += mono.size
                        }
                    }
                    codec.releaseOutputBuffer(outIdx, false)
                }
            }
        }

        codec.stop()
        codec.release()
        extractor.release()

        // Patch the WAV header with the actual data size.
        writeWavHeader(raf, totalSamplesWritten, TARGET_RATE)
        raf.close()
    }

    // -------------------------------------------------------------------------
    // DSP helpers
    // -------------------------------------------------------------------------

    /** Convert a ByteBuffer of float32 PCM samples to a ShortArray of int16. */
    private fun floatBufToShorts(buf: ByteBuffer): ShortArray {
        val floatBuf = buf.order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
        val count = floatBuf.remaining()
        val shorts = ShortArray(count)
        for (i in 0 until count) {
            val clamped = floatBuf.get().coerceIn(-1.0f, 1.0f)
            shorts[i] = (clamped * 32767f).toInt().toShort()
        }
        return shorts
    }

    /** Convert a ByteBuffer of int16 PCM samples to a ShortArray. */
    private fun byteBufToShorts(buf: ByteBuffer, size: Int): ShortArray {
        val ordered = buf.order(ByteOrder.LITTLE_ENDIAN)
        val count = size / 2
        val shorts = ShortArray(count)
        val shortBuf = ordered.asShortBuffer()
        shortBuf.get(shorts)
        return shorts
    }

    /** Down-mix interleaved multi-channel samples to mono by averaging. */
    private fun downmixToMono(input: ShortArray, channels: Int): ShortArray {
        val frames = input.size / channels
        val mono = ShortArray(frames)
        for (i in 0 until frames) {
            var sum = 0L
            for (ch in 0 until channels) {
                sum += input[i * channels + ch]
            }
            mono[i] = (sum / channels).toInt().toShort()
        }
        return mono
    }

    /** Little-endian ShortArray → ByteArray. */
    private fun shortsToBytes(shorts: ShortArray): ByteArray {
        val bytes = ByteArray(shorts.size * 2)
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        for (s in shorts) buf.putShort(s)
        return bytes
    }

    // -------------------------------------------------------------------------
    // WAV writer
    // -------------------------------------------------------------------------

    /** Write (or overwrite) the 44-byte WAV header at the start of the file. */
    private fun writeWavHeader(raf: RandomAccessFile, totalSamples: Long, sampleRate: Int) {
        val dataSize = (totalSamples * 2).toInt()  // 16-bit = 2 bytes per sample
        val buf = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)

        // RIFF header
        buf.put("RIFF".toByteArray())
        buf.putInt(36 + dataSize)       // file size − 8
        buf.put("WAVE".toByteArray())

        // fmt sub-chunk
        buf.put("fmt ".toByteArray())
        buf.putInt(16)                  // sub-chunk size
        buf.putShort(1)                 // PCM format
        buf.putShort(1)                 // mono
        buf.putInt(sampleRate)
        buf.putInt(sampleRate * 2)      // byte rate
        buf.putShort(2)                 // block align
        buf.putShort(16)                // bits per sample

        // data sub-chunk
        buf.put("data".toByteArray())
        buf.putInt(dataSize)

        raf.seek(0)
        raf.write(buf.array())
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Safe accessor that returns a default when the key is missing. */
    private fun MediaFormat.getIntegerOrDefault(key: String, default: Int): Int {
        return try { getInteger(key) } catch (_: Exception) { default }
    }

    companion object {
        private const val TARGET_RATE = 16_000

        /** Strip `file://` or `file:///` URI scheme, returning a plain path. */
        private fun stripFileScheme(path: String): String {
            return when {
                path.startsWith("file:///") -> path.removePrefix("file://")
                path.startsWith("file://")  -> path.removePrefix("file://")
                path.startsWith("file:/")   -> path.removePrefix("file:")
                else -> path
            }
        }
    }
}
