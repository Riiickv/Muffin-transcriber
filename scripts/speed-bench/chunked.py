"""Parakeet on one long clip, whole versus cut into pieces.

Usage: python -I chunked.py <bench dir> <ffmpeg> <model> <clip> <target seconds> <fixed|silence>

fixed   = cut every <target> seconds, wherever that lands
silence = cut at the pause nearest each multiple of <target> (what the app's
          VAD would give), found with ffmpeg silencedetect
Prints the summed encode time (model load excluded) and saves the joined text
in the same JSON shape bench.py writes, so wer.py can score it.
"""
import json, os, re, subprocess, sys, time

bench, ffmpeg, model, clip, target, mode = sys.argv[1:7]
target = float(target)
rel = os.path.join(bench, 'bin', 'Release')
wav = os.path.join(bench, 'audio', clip)
tmp = os.path.join(bench, 'audio', 'chunks')
os.makedirs(tmp, exist_ok=True)

info = subprocess.run([ffmpeg, '-i', wav, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'],
                      capture_output=True).stderr.decode('utf-8', 'replace')
h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', info).groups()
total = int(h) * 3600 + int(m) * 60 + float(s)
starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', info)]
ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', info)]
pauses = [(a + b) / 2 for a, b in zip(starts, ends)]

cuts = []
t = target
while t < total - 3:
    if mode == 'silence' and pauses:
        best = min(pauses, key=lambda p: abs(p - t))
        point = best if abs(best - t) <= target * 0.3 else t
    else:
        point = t
    if not cuts or point - cuts[-1] > 3:
        cuts.append(point)
    t = cuts[-1] + target if cuts else t + target
bounds = [0.0] + cuts + [total]

texts, enc_ms, wall = [], 0.0, 0.0
for i in range(len(bounds) - 1):
    piece = os.path.join(tmp, 'c%02d.wav' % i)
    subprocess.run([ffmpeg, '-v', 'error', '-y', '-ss', '%.3f' % bounds[i], '-t', '%.3f' % (bounds[i + 1] - bounds[i]),
                    '-i', wav, '-c', 'copy', piece], check=True)
    t0 = time.perf_counter()
    p = subprocess.run([os.path.join(rel, 'parakeet-cli.exe'), '-m', os.path.join(bench, 'models', model),
                        '-f', piece, '-t', '4', '-ng'], capture_output=True, cwd=rel)
    wall += time.perf_counter() - t0
    err = p.stderr.decode('utf-8', 'replace')
    enc_ms += sum(float(x) for x in re.findall(r'(?:mel|encode|decode) time\s*=\s*([\d.]+) ms', err))
    texts.append(p.stdout.decode('utf-8', 'replace').strip())

lens = ['%.0f' % (bounds[i + 1] - bounds[i]) for i in range(len(bounds) - 1)]
print(mode, model, 'pieces', lens, 'compute %.2fs' % (enc_ms / 1000), 'wall incl. %d loads %.2fs' % (len(lens), wall))
row = [{'engine': 'parakeet', 'model': '%s %s %ds' % (model.replace('ggml-parakeet-tdt-0.6b-v3-', '').replace('.bin', ''), mode, target),
        'clip': clip, 'wall_s': round(enc_ms / 1000, 2), 'timings_ms': {}, 'lang': [], 'text': ' '.join(texts)}]
name = os.path.join(bench, 'out', 'chunk_%s_%s_%d.json' % (model.split('-')[-1].replace('.bin', ''), mode, target))
json.dump(row, open(name, 'w', encoding='utf-8'), ensure_ascii=False)
print('saved', os.path.basename(name))
