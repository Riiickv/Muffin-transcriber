import difflib, glob, io, json, sys
d = sys.argv[1]
src = io.open(d + '/transcript_it.txt', encoding='utf-8').read().split()
for p in sorted(glob.glob(d + '/llm_*.json')):
    for r in json.load(io.open(p, encoding='utf-8')):
        out = r['text'].split()
        ops = [o for o in difflib.SequenceMatcher(None, src, out, autojunk=False).get_opcodes() if o[0] != 'equal']
        rep = [o for o in ops if o[0] == 'replace']
        dele = sum(o[2] - o[1] for o in ops if o[0] == 'delete')
        ex = '; '.join('%s>%s' % (' '.join(src[o[1]:o[2]]), ' '.join(out[o[3]:o[4]])) for o in rep[:5])
        print(('%-16s run %d: %2d replaced spans, %3d words deleted, %d words out | %s' % (r['label'], r['run'], len(rep), dele, len(out), ex)).encode('ascii', 'replace').decode()[:230])
