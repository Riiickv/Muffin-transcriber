"""The app's version and the installer's must agree, and the release must beat both.

Two files carry the number, because Inno Setup cannot read C#. Two copies drift,
and this pair did: the app said v1.12.32, the newest release was tagged v1.12.5,
and the build people had installed reported v1.12.38. Three numbers, no two the
same, and the updater compares them arithmetically, so v1.12.5 looked OLDER than
v1.12.32 and nobody was ever offered anything.

    py scripts/check-version.py            do the two files agree?
    py scripts/check-version.py --tag v1.5.1   would that tag reach this build?
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STRINGS = os.path.join(ROOT, "windows_app", "AppStrings.cs")
INSTALLER = os.path.join(ROOT, "muffin_installer.iss")


def app_version() -> str:
    with open(STRINGS, encoding="utf-8") as fh:
        m = re.search(r'AppVersion\s*=>\s*"v?([0-9.]+)"', fh.read())
    if not m:
        sys.exit("AppVersion not found in AppStrings.cs")
    return m.group(1)


def installer_version() -> str:
    with open(INSTALLER, encoding="utf-8") as fh:
        m = re.search(r'#define\s+MyAppVersion\s+"v?([0-9.]+)"', fh.read())
    if not m:
        sys.exit("MyAppVersion not found in muffin_installer.iss")
    return m.group(1)


def is_newer(current: str, remote: str) -> bool:
    """Exactly what AutoUpdater.IsNewer does, so this predicts the real answer."""
    c = current.lstrip("v").split(".")
    r = remote.lstrip("v").split(".")
    for i in range(min(len(c), len(r))):
        try:
            ci, ri = int(c[i]), int(r[i])
        except ValueError:
            continue
        if ri > ci:
            return True
        if ri < ci:
            return False
    return len(r) > len(c)


def main() -> int:
    app, inst = app_version(), installer_version()
    print("AppStrings.cs        %s" % app)
    print("muffin_installer.iss %s" % inst)

    if app != inst:
        print("\nMISMATCH. The installer would stamp a version the app does not")
        print("report, so the updater would compare the wrong number.")
        return 1
    print("they agree")

    if "--tag" in sys.argv:
        tag = sys.argv[sys.argv.index("--tag") + 1].lstrip("v")
        # Equal is the normal case: this is the release OF this build, so it is
        # not supposed to offer itself anything. Only a tag BELOW the app
        # version is the mistake, because then no future release in that range
        # can ever reach the people running it.
        if tag == app:
            print("\ntag v%s matches this build. Correct for releasing it." % tag)
            return 0
        if is_newer(app, tag):
            print("\ntag v%s is newer than this build (%s)." % (tag, app))
            print("Fine, but odd: you are tagging a version the source does not claim.")
            return 0
        print("\ntag v%s is OLDER than this build (%s)." % (tag, app))
        print("Nobody running %s would ever be offered it, because the updater" % app)
        print("compares these numerically. Pick %s or higher." % app)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
