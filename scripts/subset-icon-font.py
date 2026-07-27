"""Rebuild the desktop app's icon font from the mobile app's copy.

Material Symbols Rounded is a 15 MB variable font carrying every icon Google
ships. The desktop UI uses about two dozen of them, and unlike the phone (where
React Native loads the font once for the app's lifetime) every screen here is
its own document, so that whole font is re-instanced on each switch.

This keeps only the codepoints the web UI actually references, with all four
variation axes intact so font-variation-settings still works (FILL 1 for the
filled mic, and the rest).

Run it after adding an icon to any page:

    python scripts/subset-icon-font.py

Source of truth is the MOBILE font file: both apps must draw the same glyphs.
"""

import glob
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "mobile_app", "assets", "fonts", "MaterialSymbolsRounded.ttf")
WEB = os.path.join(ROOT, "windows_app", "web")
TARGET = os.path.join(WEB, "fonts", "MaterialSymbolsRounded.ttf")

# The Private Use Area, which is where Material Symbols live.
PUA_START, PUA_END = 0xE000, 0xF8FF


def codepoints_in_use():
    """Every icon codepoint referenced by the web UI, however it is written."""
    found = set()
    for path in glob.glob(os.path.join(WEB, "*.html")) + glob.glob(os.path.join(WEB, "*.js")):
        text = io.open(path, encoding="utf-8").read()

        # &#xE88A;
        for match in re.finditer(r"&#x([0-9A-Fa-f]{4,5});", text):
            found.add(int(match.group(1), 16))

        # ""
        for match in re.finditer(r"\\u([0-9A-Fa-f]{4})", text):
            found.add(int(match.group(1), 16))

        # The literal glyph, pasted straight into the markup.
        for char in text:
            found.add(ord(char))

    return sorted(c for c in found if PUA_START <= c <= PUA_END)


def main():
    if not os.path.exists(SOURCE):
        sys.exit("Source font not found: %s" % SOURCE)

    used = codepoints_in_use()
    if not used:
        sys.exit("No icon codepoints found in %s - refusing to build an empty font." % WEB)

    before = os.path.getsize(SOURCE)
    subprocess.check_call([
        sys.executable, "-m", "fontTools.subset", SOURCE,
        "--unicodes=" + ",".join("%04X" % c for c in used),
        "--layout-features=*",
        "--output-file=" + TARGET,
    ])

    after = os.path.getsize(TARGET)
    print("%d glyphs kept: %s" % (len(used), " ".join("U+%04X" % c for c in used)))
    print("%.1f MB -> %.1f KB" % (before / 1048576.0, after / 1024.0))


if __name__ == "__main__":
    main()
