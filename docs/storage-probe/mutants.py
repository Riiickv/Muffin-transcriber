"""Deliberate bugs in utils/noteStore.ts, one at a time. Each must make a test fail."""
import io
import subprocess

p = 'utils/noteStore.ts'
orig = io.open(p, encoding='utf-8', newline='').read()
muts = [
    ("M1 no read-back check",
     "same = (await files.read(file.stem + '.json')) === file.text;",
     "await files.read(file.stem + '.json'); same = true;"),
    ("M2 old value removed even when incomplete",
     "    if (!complete) {\n      setState({ legacyKept: true });\n    } else if (written.length === 0) {",
     "    if (true as boolean) {"),
    ("M3 write straight to .json, no temporary file",
     "      await files.write(stem + '.tmp', text);",
     "      await files.write(stem + '.json', text); await files.write(stem + '.tmp', text);"),
    ("M4 no marker on delete",
     "if (legacyMayExist) await files.write(stem + '.gone', '');", ""),
    ("M5 old value overwrites an existing file",
     "      if (have.has(note.id)) continue;\n", ""),
    ("M6 damaged main pushed over the good spare copy",
     "      if (bak.kind === 'ok') return { note: bak.note, unreadable: false };",
     "      if (bak.kind === 'ok') { hasMain.add(stem); return { note: bak.note, unreadable: false }; }"),
    ("M7 unopenable main treated as damaged, spare copy used",
     "      if (main.kind === 'other') {\n        blocked.add(stem);\n        return { note: null, unreadable: true };\n      }\n      if (main.kind === 'torn') damaged = true;",
     "      damaged = true;"),
    ("M8 blocked files may be written",
     "    if (blocked.has(stem)) throw new Error('A file that could not be read is in the way');", ""),
    ("M9 no spare copy kept",
     "      await files.move(stem + '.json', stem + '.bak').catch(() => undefined);", ""),
    ("M10 half-written tmp put in place instead of dropped",
     "      if (tmp.kind === 'torn' || tmp.kind === 'empty') await files.remove(stem + '.tmp').catch(() => undefined);",
     "      if (tmp.kind === 'torn' || tmp.kind === 'empty') await files.move(stem + '.tmp', stem + '.json').catch(() => undefined);"),
    ("M11 failed listing treated as loaded and complete",
     "      setState({ loaded: true, failed: true });",
     "      setState({ loaded: true, failed: false });"),
    ("M12 old value that cannot be read treated as no old value",
     "      setState({ legacyKept: true });\n      return fromFiles;\n    }\n    if (raw === null) {",
     "      return fromFiles;\n    }\n    if (raw === null) {"),
    ("M13 delete leaves the spare copy",
     "        await files.remove(stem + '.bak');\n", ""),
    ("M14 no queue: writes run as they come",
     "    const run = queue.then(job, job);", "    const run = job();"),
    ("M15 spare copy replaced on every write",
     "    if (hasMain.has(stem) && !fresh.has(stem)) {", "    if (hasMain.has(stem)) {"),
    ("M16 an empty file counted as an unreadable note",
     "      if (main.kind === 'torn') damaged = true;", "      damaged = true;"),
    ("M17 wrong copy left on disk after a failed read-back",
     "        await files.remove(file.stem + '.json').catch(() => undefined);\n        hasMain.delete(file.stem);", "        hasMain.delete(file.stem);"),
    ("M18 complete tmp ignored at start",
     "      if (tmp.kind === 'ok') {", "      if (false as boolean && tmp.kind === 'ok') {"),
    ("M19 patch merges nothing",
     "    cached = withNote(cached ?? [], { ...current, ...change, id });", "    cached = withNote(cached ?? [], { ...current, id });"),
    ("M20 old value with a non-note element still removed",
     "      if (!note || !stem || seen.has(note.id)) {\n        complete = false;\n        continue;\n      }",
     "      if (!note || !stem || seen.has(note.id)) {\n        continue;\n      }"),
    ("M21 old value removed in the session that wrote the files",
     "    } else if (written.length === 0) {", "    } else if (true as boolean) {"),
    ("M22 a complete but just-written move shows the warning",
     "    if (!complete) {\n      setState({ legacyKept: true });", "    if (!complete || written.length > 0) {\n      setState({ legacyKept: true });"),
]
survived = 0
try:
    for name, a, b in muts:
        assert orig.count(a) == 1, (name, orig.count(a))
        io.open(p, 'w', encoding='utf-8', newline='').write(orig.replace(a, b))
        r = subprocess.run('node --experimental-strip-types --test tests/noteStore.test.ts', shell=True,
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        failed = [line[7:72] for line in r.stdout.splitlines() if line.startswith('not ok')]
        if not failed:
            survived += 1
        print(('KILLED  ' if failed else 'SURVIVED'), name, '|', len(failed), 'failing', '|', failed[0] if failed else '')
finally:
    io.open(p, 'w', encoding='utf-8', newline='').write(orig)
print('survivors:', survived, 'of', len(muts))
