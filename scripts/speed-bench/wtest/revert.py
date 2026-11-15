"""Write a copy of the patched whisper.cpp with the two [muffin] hunks reverted."""
import importlib.util, io, sys
src, dst, port = sys.argv[1:4]
code = io.open(port, encoding='utf-8').read()
ns = {}
# Only the four string constants are needed; stop before the edits run.
head = code[code.index("DETECT_OLD = '''"):code.index("edit('cpp/whisper.cpp'")]
exec(head, ns)
s = io.open(src, encoding='utf-8', newline='').read()
for new, old in ((ns['DETECT_NEW'], ns['DETECT_OLD']), (ns['ENCODE_NEW'], ns['ENCODE_OLD'])):
    assert s.count(new) == 1
    s = s.replace(new, old)
assert 'enc_reuse_ok' not in s and 'muffin' not in s
io.open(dst, 'w', encoding='utf-8', newline='').write(s)
print('reverted copy written')
