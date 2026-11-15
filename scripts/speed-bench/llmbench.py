"""Improve (the app's formatTranscript prompt) through llama-server, with and
without speculative decoding.

Usage: python -I llmbench.py <llmbench dir> <transcript txt> <model gguf> <label> <repeats> [server args...]

Builds the same prompt mobile_app/utils/LLMEngine.ts builds (buildTaskPrompt +
ChatML, the short instruction for sub-1B models, /no_think for Qwen3), sends it
to /completion with the app's sampling (temperature 0.3, repeat penalty 1.15
over 256 tokens), and prints llama.cpp's own timings.
"""
import io, json, os, subprocess, sys, time, urllib.request

bench, tpath, model, label, repeats = sys.argv[1:6]
extra = sys.argv[6:]
repeats = int(repeats)
PORT = 8123

transcript = io.open(tpath, encoding='utf-8').read().strip()
small = any(s in model.lower() for s in ('0.5b', '0.6b'))
instruction = (
    'Copy the transcript out, adding commas, full stops and capital letters. Change no words.'
    if small else
    "Write the transcript out as correct, readable text in its own language. Put commas where the sentence needs them, full stops at the ends of sentences, and capital letters on names of people, places and brands. Fix clear speech-to-text errors such as wrong verb forms, wrong agreement, and words split or joined incorrectly. Keep the speaker's wording where it is already correct, keep the meaning exactly, and add nothing that was not said."
)
GROUNDING = 'Every statement must come from the transcript. Begin with the first word of the result itself.'
task = 'TASK: %s\n\n%s\n\nYou must reply strictly in Italian (DO NOT translate). Process the transcript now.' % (instruction, GROUNDING)
system = ('You are a precise text-processing assistant. You will be given a transcript, then a task about it.\n\n'
          'TRANSCRIPT:\n%s\n\nRULES:\n1. Work ONLY with the transcript above.\n'
          '2. Reply ONLY with the final result - no conversational text, no pleasantries, no markdown code fences or formatting tags, and do not wrap the output in quotes.') % transcript
user = task + ('\n\n/no_think' if 'qwen3' in model.lower() else '')
prompt = '<|im_start|>system\n%s<|im_end|>\n<|im_start|>user\n%s<|im_end|>\n<|im_start|>assistant\n' % (system, user)
n_predict = max(512, min(3072, len(transcript) // 3 + 256))

exe = os.path.join(bench, 'bin', 'llama-server.exe')
args = [exe, '-m', os.path.join(bench, 'models', model), '-c', '4096', '-t', '4', '-tb', '4', '-np', '1',
        '--port', str(PORT), '--no-webui'] + extra
log = open(os.path.join(bench, 'out', 'server_%s.log' % label), 'wb')
srv = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT, cwd=os.path.join(bench, 'bin'))
try:
    for _ in range(240):
        try:
            if json.load(urllib.request.urlopen('http://127.0.0.1:%d/health' % PORT, timeout=2)).get('status') == 'ok':
                break
        except Exception:
            if srv.poll() is not None:
                raise SystemExit('server exited, see server_%s.log' % label)
            time.sleep(0.5)
    rows = []
    for i in range(repeats):
        body = json.dumps({'prompt': prompt, 'n_predict': n_predict, 'temperature': 0.3, 'repeat_penalty': float(os.environ.get('REP', '1.15')),
                           'repeat_last_n': 256, 'seed': int(os.environ.get('SEED', '42')), 'cache_prompt': False, 'stream': False}).encode()
        t0 = time.perf_counter()
        r = json.load(urllib.request.urlopen(urllib.request.Request(
            'http://127.0.0.1:%d/completion' % PORT, body, {'Content-Type': 'application/json'}), timeout=1800))
        wall = time.perf_counter() - t0
        t = r.get('timings', {})
        rows.append({'label': label, 'model': model, 'run': i, 'wall_s': round(wall, 2), 'timings': t, 'text': r.get('content', '')})
        print('%-22s run %d wall %6.2fs | prompt %4d tok %7.1f tok/s | gen %4d tok %6.2fs %6.1f tok/s | draft %s accepted %s | out %d chars' % (
            label, i, wall, t.get('prompt_n', 0), t.get('prompt_per_second', 0), t.get('predicted_n', 0),
            t.get('predicted_ms', 0) / 1000, t.get('predicted_per_second', 0), t.get('draft_n'), t.get('draft_n_accepted'),
            len(r.get('content', ''))), flush=True)
    json.dump(rows, io.open(os.path.join(bench, 'out', 'llm_%s.json' % label), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
finally:
    srv.terminate()
    try:
        srv.wait(10)
    except Exception:
        srv.kill()
    log.close()
