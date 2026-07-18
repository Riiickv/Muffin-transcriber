# Muffin - Play Store release checklist

Everything needed to go from this repo to a live Play Store listing. The code is
ready; this file covers the parts that happen outside the code.

---

## 1. The keystore (one-time, ~5 minutes)

**What it is:** a password-protected file containing your app's digital
signature - the stamp that proves an update really comes from you. When you
upload version 1.1 later, Play checks its stamp matches version 1.0's. No
matching stamp, no update.

**Why it matters:** whoever holds this file can publish updates to your app.
Treat it like the key to the app itself.

(Technical note: Play uses "Play App Signing", so your file is the *upload key*.
If you ever lose it, Google support can reset it after identity checks - a slow
nuisance rather than a catastrophe, but still: don't lose it.)

### Create it

Open PowerShell and run:

```powershell
keytool -genkey -v -keystore "$env:USERPROFILE\muffin-upload.jks" -alias muffin -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Muffin"
```

The `-dname "CN=Muffin"` fills the certificate identity for you, so keytool
won't prompt for a name, city or country - and nothing personal ends up baked
into the certificate, which anyone can extract from a sideloaded APK. It will
only ask:

- **Keystore password** - invent a strong one and save it in a password manager
  right now. You'll type it twice.
- Confirm with `yes`.

This creates `C:\Users\ricky\muffin-upload.jks`. **It is deliberately OUTSIDE
the repo** - never move it into the project, never commit it.

### Back it up

Copy `muffin-upload.jks` to at least two places that survive this PC dying -
cloud storage and a USB stick. Store the password separately (password manager).

### Tell Gradle about it

Create (or edit) the file `C:\Users\ricky\.gradle\gradle.properties` and add:

```properties
MUFFIN_UPLOAD_STORE_FILE=C:\\Users\\ricky\\muffin-upload.jks
MUFFIN_UPLOAD_STORE_PASSWORD=your-keystore-password
MUFFIN_UPLOAD_KEY_ALIAS=muffin
MUFFIN_UPLOAD_KEY_PASSWORD=your-keystore-password
```

(Same password twice unless you chose a separate key password. Note the doubled
backslashes.)

That file lives in your user folder, not the repo, so the passwords never touch
git. The build reads it automatically: the repo contains a config plugin
(`mobile_app/plugins/withReleaseSigning.js`) that wires this in on every
prebuild - so the signing **survives `--prebuild`**, which regenerates the
android folder and would otherwise silently reset to debug signing.

### Build the uploadable file

```
build-android.bat --aab
```

The `.aab` it produces is now signed with your key and ready for Play Console.
Without the gradle.properties entries it falls back to the debug key (fine for
testing, rejected by Play).

---

## 2. Privacy policy URL

The policy is `PRIVACY.md` in the repo root. After pushing, use:

```
https://github.com/Riiickv/Muffin-transcriber/blob/main/PRIVACY.md
```

Paste that URL in Play Console → App content → Privacy policy. (Play requires a
policy because the app requests RECORD_AUDIO, even though nothing is collected.)

---

## 3. Data safety form (Play Console → App content → Data safety)

Answer exactly this:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |

That's the whole form. "Collect" means *transmitted off the device* - Muffin
transcribes on-device, stores on-device, and sends nothing. Model downloads are
plain HTTPS file fetches carrying no user data, and the app opts out of
Android's cloud backup, so nothing leaves via that route either.

If the review asks about internet access despite "No": the app downloads AI
model files from Hugging Face and can open the developer's donation page in the
browser. Neither transmits user data.

## 4. Other App content declarations

| Section | Answer |
|---|---|
| Ads | **No, my app does not contain ads** |
| App access | All functionality available without special access (no login) |
| Content rating questionnaire | Utility/productivity; no violence, no user-to-user content, no location sharing. Lands at "Everyone"/PEGI 3 |
| Target audience | **13 and over** (do NOT tick under-13 - that triggers the Families policy) |
| News app | No |
| COVID-19 tracing | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Account deletion | Not applicable (no accounts) |

## 5. Store listing needs (your department)

- App icon 512×512 (have: `icon.png` - export at 512)
- Feature graphic **1024×500**
- At least 2 phone screenshots (take them from the real app; the welcome, a
  transcript, the setup wizard and the models list all photograph well)
- Short description (max 80 chars) and full description (max 4000)
- Category: Productivity or Tools

## 6. Before uploading - the one test that matters

Full first-run on a phone that has never had Muffin (or after Settings → Apps →
Muffin → Clear storage): welcome → Setup! → three pages → download the suggested
transcriber → Start! → record something → see the transcript. That is the exact
path every Play reviewer walks.
