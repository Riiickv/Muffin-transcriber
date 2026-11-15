"""Word error rate of each saved transcript against the Wikisource text.

Usage: python -I wer.py <reference page txt> <bench json> [<bench json> ...]

The recording has a LibriVox notice before and after the diary entry, so the
reference is aligned INSIDE the hypothesis: hypothesis words before and after
the entry cost nothing (infix edit distance). WER = (sub + del + ins) / ref words.
"""
import io, json, re, sys, unicodedata

NUM = {'1': 'uno', '2': 'due', '3': 'tre', '4': 'quattro', '5': 'cinque', '6': 'sei', '7': 'sette',
       '8': 'otto', '9': 'nove', '10': 'dieci'}


def norm(t):
    t = re.sub(r'\[[0-9:.]+ --> [0-9:.]+\]', ' ', t)
    t = unicodedata.normalize('NFC', t).lower()
    t = re.sub(r"[’'`]", ' ', t)
    t = re.sub(r'[^\w\s]', ' ', t, flags=re.U)
    return [NUM.get(w, w) for w in t.split()]


def infix_wer(ref, hyp):
    # prev[j] = cost of aligning ref[:i] ending at hyp[:j]; free start anywhere in hyp
    prev = [0] * (len(hyp) + 1)
    for i in range(1, len(ref) + 1):
        cur = [i] + [0] * len(hyp)
        for j in range(1, len(hyp) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref[i - 1] != hyp[j - 1]))
        prev = cur
    return min(prev) / len(ref), min(prev)


page = io.open(sys.argv[1], encoding='utf-8').read()
a = page.index('Sono due settimane')
b = page.rindex('come si deve') + len('come si deve')
ref = norm(page[a:b])
print('reference words:', len(ref))
for path in sys.argv[2:]:
    for row in json.load(io.open(path, encoding='utf-8')):
        if row['clip'] != 'it_181s.wav':
            continue
        hyp = norm(row['text'])
        wer, errs = infix_wer(ref, hyp)
        print('%-9s %-38s wall %6.2fs  WER %5.1f%%  (%d errors, %d hyp words)' % (
            row['engine'], row['model'], row['wall_s'], wer * 100, errs, len(hyp)))
