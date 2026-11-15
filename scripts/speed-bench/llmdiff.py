import difflib, glob, io, json, sys
d = sys.argv[1]
rows = {}
for p in sorted(glob.glob(d + '/llm_*.json')):
    for r in json.load(io.open(p, encoding='utf-8')):
        rows.setdefault(r['label'], []).append(r)
src = io.open(d + '/transcript_it.txt', encoding='utf-8').read().split()
def show(tag, a, b):
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = [o for o in sm.get_opcodes() if o[0] != 'equal']
    print(('%-28s %d words vs %d, %d differing spans' % (tag, len(a), len(b), len(ops))).encode('ascii', 'replace').decode())
    for o in ops[:6]:
        print(('      %s: %r -> %r' % (o[0], ' '.join(a[max(0, o[1]-2):o[2]+1]), ' '.join(b[max(0, o[3]-2):o[4]+1]))).encode('ascii', 'replace').decode())
for base, pref in (('base15', 's15_'), ('base06', 's06_')):
    bt = rows[base][0]['text'].split()
    show('input -> ' + base, src, bt)
    for k, v in rows.items():
        if k.startswith(pref):
            show(base + ' -> ' + k, bt, v[0]['text'].split())
