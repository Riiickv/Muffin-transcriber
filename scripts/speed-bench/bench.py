"""Wall-clock comparison of parakeet-cli and whisper-cli on the same clips.

Usage: python -I bench.py <bench dir> <engine:model[,engine:model...]> <clip[,clip...]> [threads] [repeats]
Wall time includes process start and model load; the load is reported
separately where the tool prints it.
"""
import json, os, re, subprocess, sys, time

bench = sys.argv[1]
jobs = [j.split(':') for j in sys.argv[2].split(',')]
clips = sys.argv[3].split(',')
threads = sys.argv[4] if len(sys.argv) > 4 else '4'
repeats = int(sys.argv[5]) if len(sys.argv) > 5 else 2

rel = os.path.join(bench, 'bin', 'Release')
out = []
for engine, model in jobs:
    exe = os.path.join(rel, 'parakeet-cli.exe' if engine == 'parakeet' else 'whisper-cli.exe')
    mpath = os.path.join(bench, 'models', model)
    for clip in clips:
        wav = os.path.join(bench, 'audio', clip)
        args = [exe, '-m', mpath, '-f', wav, '-t', threads, '-ng']
        if engine == 'whisper':
            args += os.environ.get('WHISPER_FLAGS', '-l auto -bs 1 -bo 1').split()
        best, text, err = None, '', ''
        for _ in range(repeats):
            t0 = time.perf_counter()
            p = subprocess.run(args, capture_output=True, cwd=rel)
            dt = time.perf_counter() - t0
            if best is None or dt < best:
                best = dt
                text = p.stdout.decode('utf-8', 'replace').strip()
                err = p.stderr.decode('utf-8', 'replace')
        timings = dict(re.findall(r'(load|mel|encode|decode|total) time\s*=\s*([\d.]+) ms', err))
        lang = re.findall(r'auto-detected language: (\w+)', err)
        row = {'engine': engine, 'model': model, 'clip': clip, 'wall_s': round(best, 2),
               'timings_ms': timings, 'lang': lang[:1], 'text': text}
        out.append(row)
        print(engine, model, clip, 'wall', row['wall_s'], 's', timings, lang[:1], flush=True)
        print('   ', text[:260].replace('\n', ' ').encode('ascii', 'replace').decode(), flush=True)

name = 'bench_%d.json' % int(time.time())
with open(os.path.join(bench, 'out', name), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print('saved', name)
