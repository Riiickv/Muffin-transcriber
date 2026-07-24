// Exports the mobile app's strings into the Windows app.
//
// The two apps are the same product, so they share ONE source of truth for
// text: mobile_app/constants/strings.ts (English) and its translations. This
// script flattens those TS modules into the dot-key JSON the Windows app's
// LocalizationManager reads, so a wording change made for mobile lands on PC
// by re-running this - the texts can never drift apart again.
//
// Run from the repo root (requires Node >= 22 for --experimental-strip-types):
//   node --experimental-strip-types scripts/export-strings-to-pc.mjs
//
// Output: windows_app/Strings/{en,it,es,fr,de,pt}.json  (GENERATED - do not
// hand-edit; edit the mobile files and re-run.)
//
// PC-only text (updater, engine repair, mini window...) lives separately in
// windows_app/Strings/pc.{lang}.json and is NOT touched by this script.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'windows_app', 'Strings');

const { APP_STRINGS } = await import('../mobile_app/constants/strings.ts');
const { IT } = await import('../mobile_app/constants/translations/it.ts');
const { ES } = await import('../mobile_app/constants/translations/es.ts');
const { FR } = await import('../mobile_app/constants/translations/fr.ts');
const { DE } = await import('../mobile_app/constants/translations/de.ts');
const { PT } = await import('../mobile_app/constants/translations/pt.ts');

function flatten(obj, prefix = '', into = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, into);
    else if (typeof value === 'string') into[path] = value;
  }
  return into;
}

mkdirSync(outDir, { recursive: true });

const languages = { en: APP_STRINGS, it: IT, es: ES, fr: FR, de: DE, pt: PT };
for (const [code, strings] of Object.entries(languages)) {
  const flat = flatten(strings);
  writeFileSync(join(outDir, `${code}.json`), JSON.stringify(flat, null, 2) + '\n');
  console.log(`${code}.json: ${Object.keys(flat).length} keys`);
}
