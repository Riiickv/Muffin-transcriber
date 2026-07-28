// Behaviour every screen shares: the mic button, navigation coming from the
// app, and the small pieces of chrome that outlive a single page.

(function () {
  // The app can move the UI itself: the assistant's NAVIGATE_TO, a finished
  // recording landing on the transcribe screen, the setup wizard finishing.
  Muffin.on("navigate", function (payload) {
    var page = payload && (payload.page || pageFor(payload.tab));
    if (!page) return;
    var here = location.pathname.split("/").pop() || "index.html";
    if (page !== here) location.href = page;
  });

  // The title bar's support button asks here, so the question looks like every
  // other question the app asks. Nothing is sent anywhere until "Buy a coffee".
  Muffin.on("app.askSupport", function () {
    showDialog({
      title: Muffin.t("settings.supportTitle", "Support me!"),
      message: Muffin.t("settings.supportMessage", ""),
      // The same logo the mobile dialog shows, at its real 488x366 ratio.
      image: "images/RickLogo.png",
      imageAspect: 488 / 366,
      buttons: [
        { label: Muffin.t("settings.supportCancel", "Maybe later"), variant: "ghost" },
        { label: Muffin.t("settings.supportButton", "Buy a coffee"), onPress: function () { Muffin.invoke("app.support"); } },
      ],
    });
  });

  function pageFor(tab) {
    switch (tab) {
      case "home": case "transcribe": return "index.html";
      case "history": case "library": return "history.html";
      case "chat": return "chat.html";
      case "settings": return "settings.html";
      case "models": return "models.html";
      default: return null;
    }
  }

  // ---- the mic button ----------------------------------------------------
  // It sits on the rail of every screen, exactly like the mobile FAB: press it
  // anywhere, and wherever you are when you stop, the audio lands on the
  // transcribe screen and starts working.

  var mic = document.getElementById("mic");

  function paintMic(recording) {
    if (!mic) return;
    mic.classList.toggle("recording", !!recording);
    mic.querySelector(".msr").textContent = recording ? "" : ""; // stop / mic
    mic.title = Muffin.t(recording ? "record.stopRecording" : "record.startRecording", recording ? "Stop recording" : "Start recording");
    setTimerVisible(!!recording);
  }

  if (mic) {
    mic.addEventListener("click", function () {
      Muffin.invoke("record.toggle").then(function (state) {
        if (!state) return;
        if (state.error) { showToast(state.error); return; }
        paintMic(state.recording);
      });
    });

    Muffin.on("record.changed", function (state) { paintMic(state && state.recording); });
    Muffin.ready(function () {
      Muffin.invoke("record.state").then(function (state) { paintMic(state && state.recording); });
    });

    // A timer under the mic while it runs, like the pill that slides out from
    // under the mobile FAB.
    Muffin.on("record.progress", function (p) {
      var timer = document.getElementById("mic-timer");
      if (!timer || !p) return;
      var m = Math.floor(p.seconds / 60);
      var s = String(p.seconds % 60);
      timer.textContent = m + ":" + (s.length < 2 ? "0" + s : s);
    });
  }

  function setTimerVisible(on) {
    var timer = document.getElementById("mic-timer");
    if (timer) timer.hidden = !on;
  }

  // ---- model downloads ---------------------------------------------------
  // Mobile keeps a progress ring in the header of every tab, so a download is
  // still visibly running when you walk away from the Models screen. Here only
  // that screen listened, and a download became invisible the moment you left
  // it. The ring lives on the rail, which every screen has, and the app hands
  // over the running downloads on load so a fresh page picks them straight up.

  var downloads = {};

  function ringEl() {
    var el = document.getElementById("dl-ring");
    if (el) return el;
    var rail = document.querySelector(".rail");
    if (!rail) return null;

    el = document.createElement("button");
    el.id = "dl-ring";
    el.className = "dl-ring";
    el.hidden = true;
    el.innerHTML =
      '<svg viewBox="0 0 36 36" aria-hidden="true">' +
        '<circle class="dl-track" cx="18" cy="18" r="15" />' +
        '<circle class="dl-bar" cx="18" cy="18" r="15" />' +
      '</svg><span class="dl-pct"></span>';
    el.addEventListener("click", function () {
      if ((location.pathname.split("/").pop() || "") !== "models.html") location.href = "models.html";
    });
    rail.insertBefore(el, rail.querySelector(".rail-spacer"));
    return el;
  }

  function paintDownloads() {
    var el = ringEl();
    if (!el) return;
    var files = Object.keys(downloads);
    if (!files.length) { el.hidden = true; return; }

    // Several at once is rare, and one readable number beats a stack of bars.
    var avg = files.reduce(function (sum, f) { return sum + (downloads[f] || 0); }, 0) / files.length;
    var circumference = 2 * Math.PI * 15;
    el.querySelector(".dl-bar").style.strokeDasharray = circumference;
    el.querySelector(".dl-bar").style.strokeDashoffset = circumference * (1 - avg / 100);
    el.querySelector(".dl-pct").textContent = Math.round(avg) + "%";
    el.title = Muffin.t("settings.modelManagement", "Models");
    el.hidden = false;
  }

  Muffin.on("models.progress", function (p) {
    if (!p || !p.file) return;
    downloads[p.file] = p.percent || 0;
    paintDownloads();
  });

  Muffin.on("models.done", function (e) {
    if (!e || !e.file) return;
    delete downloads[e.file];
    paintDownloads();
  });

  // ---- banners -----------------------------------------------------------
  // Updates and engine problems used to be a stock system InfoBar floating over
  // a themed app. Drawn here, they carry the app's own accent, type and corners.

  function bannerEl() {
    var el = document.getElementById("app-banner");
    if (el) return el;
    el = document.createElement("div");
    el.id = "app-banner";
    el.className = "app-banner";
    el.hidden = true;
    el.innerHTML =
      '<span class="msr b-icon"></span>' +
      '<div class="b-text"><div class="b-title"></div><div class="b-message"></div>' +
      '<div class="b-progress" hidden><i style="width:0%"></i></div></div>' +
      '<button class="btn b-action" hidden></button>' +
      '<button class="b-close" aria-label="Close"><span class="msr"></span></button>';
    document.body.appendChild(el);

    el.querySelector(".b-close").addEventListener("click", function () {
      el.hidden = true;
      try { sessionStorage.setItem("muffin.bannerDismissed", el.dataset.signature || ""); } catch (e) { }
    });
    el.querySelector(".b-action").addEventListener("click", function () {
      Muffin.invoke("app.bannerAction");
    });
    return el;
  }

  function showBanner(b) {
    if (!b) return;

    // The banner is replayed on every screen, so one the user closed must not
    // come back; a different one still must.
    var signature = (b.kind || "") + "|" + (b.title || "") + "|" + (b.message || "");
    try {
      if (sessionStorage.getItem("muffin.bannerDismissed") === signature) return;
    } catch (e) { }

    var el = bannerEl();
    el.dataset.signature = signature;
    el.className = "app-banner " + (b.kind || "info");
    el.querySelector(".b-icon").textContent =
      b.kind === "error" || b.kind === "warning" ? "" : ""; // warning / check_circle
    el.querySelector(".b-title").textContent = b.title || "";
    el.querySelector(".b-title").hidden = !b.title;
    el.querySelector(".b-message").textContent = b.message || "";
    setBannerAction(b.actionLabel);
    setBannerProgress(b.percent);
    el.hidden = false;
  }

  function setBannerAction(label) {
    var action = bannerEl().querySelector(".b-action");
    action.textContent = label || "";
    action.hidden = !label;
  }

  function setBannerProgress(percent) {
    var bar = bannerEl().querySelector(".b-progress");
    bar.hidden = percent === undefined || percent === null;
    if (!bar.hidden) bar.firstElementChild.style.width = percent + "%";
  }

  Muffin.on("app.banner", showBanner);
  Muffin.on("app.bannerUpdate", function (b) {
    if (!b) return;
    bannerEl().querySelector(".b-message").textContent = b.message || "";
    setBannerAction(b.actionLabel);
    setBannerProgress(b.percent);
    bannerEl().hidden = false;
  });

  // A banner raised before this screen existed is replayed on boot, and so is
  // any download that started on a screen this one replaced.
  Muffin.ready(function () {
    var data = Muffin.data();
    if (!data) return;
    if (data.banner) showBanner(data.banner);
    if (data.downloads) { downloads = data.downloads; paintDownloads(); }
  });

  // ---- toast -------------------------------------------------------------

  // The transcribe screen announces its progress through here rather than
  // parking a line of text under the buttons, so a failure has to look like a
  // failure: an error that reads exactly like "Transcription complete" is worse
  // than no colour at all. An error also lingers, since it is the one you may
  // want to read twice.
  function showToast(message, kind) {
    var el = document.getElementById("toast");
    if (!el || !message) return;
    el.textContent = message;
    el.className = "toast " + (kind || "info");
    el.hidden = false;
    // Restart the entrance, or a second toast slides in without moving.
    el.style.animation = "none";
    void el.offsetHeight;
    el.style.animation = "";
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.hidden = true; }, kind === "error" ? 5000 : 2600);
  }

  window.showToast = showToast;

  // ---- the stylised waveform ---------------------------------------------
  // Copied from the mobile utils/waveform.ts: a deterministic pattern seeded by
  // the recording's id, NOT real amplitude, so the same recording draws the same
  // shape on the phone and on the PC.

  window.waveformBars = function (seed, count) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    var rand = function () {
      h += 0x6d2b79f5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    var bars = [];
    for (var n = 0; n < count; n++) {
      var base = 0.25 + rand() * 0.55;
      var peak = rand() > 0.85 ? 0.2 : 0;
      bars.push(Math.max(0.2, Math.min(1, base + peak)));
    }
    return bars;
  };

  // ---- dates and durations, copied from the mobile utils/format.ts --------
  // Same rules, same output, so a transcript reads identically in both apps.

  function pad2(n) { return String(n).padStart(2, "0"); }

  function localeDate(iso, options, fallback) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleDateString(undefined, options);
    } catch (e) {
      return fallback(d);
    }
  }

  // "Mon, Jan 5, 3:04 PM"
  window.formatHistoryDate = function (iso) {
    return localeDate(
      iso,
      { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
      function (d) { return d.toDateString() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
    );
  };

  // "now", "5m", "3h", "2d", "Jul 6"
  window.formatRelativeTime = function (iso) {
    var then = new Date(iso).getTime();
    if (!isFinite(then)) return "";
    var diffMin = Math.floor((Date.now() - then) / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return diffMin + "m";
    var diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return diffH + "h";
    var diffD = Math.floor(diffH / 24);
    if (diffD < 7) return diffD + "d";
    return localeDate(iso, { month: "short", day: "numeric" }, function (d) { return d.toDateString().slice(4, 10); });
  };

  // MM:SS, or H:MM:SS past an hour so a lecture reads "1:30:00".
  window.formatDuration = function (totalSeconds) {
    if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = Math.floor(totalSeconds % 60);
    return h > 0 ? h + ":" + pad2(m) + ":" + pad2(s) : pad2(m) + ":" + pad2(s);
  };
})();
