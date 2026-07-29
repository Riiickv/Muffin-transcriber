// The transcript panel, shared by the transcribe screen and the library detail,
// the same way the mobile app shares TranscriptPanel between them. Fix a layout
// quirk here and both screens get it.
//
// The typewriter reveal is the desktop one, unchanged: a 20ms tick, and chars
// per tick = max(base, ceil(length / 240)) with base 1 / 3 / 9 for
// Slow / Balanced / Fast, so a long transcript still finishes in about 5s.

// StreamingText.tsx: the newest characters carry an accent trail that fades
// back to the text colour behind them, so you can see where the writing is.
// Same two numbers as mobile.
var TAIL_CHARS = 44;
var TAIL_STEPS = 8;

function createTranscript(root) {
  var box = root.querySelector(".transcript");
  var tabs = root.querySelectorAll(".segment[data-tab]");
  var copyBtn = root.querySelector("[data-copy]");
  var settledNode = null;
  var tailSpans = [];

  var content = { raw: "", formatted: "", summary: "" };
  var active = "raw";
  var timer = null;
  var target = "";
  var index = 0;
  var perTick = 3;

  function speedPerTick(speed, length) {
    var base = speed === "Slow" ? 1 : speed === "Fast" ? 9 : 3;
    return Math.max(base, Math.ceil(length / 240));
  }

  // One text node for everything already settled and TAIL_STEPS spans for the
  // trail. The settled text is updated through nodeValue, which costs nothing
  // to grow, so a two-hour transcript is not re-parsed 50 times a second.
  function trailNodes() {
    if (settledNode && settledNode.parentNode === box) return;
    box.textContent = "";
    settledNode = document.createTextNode("");
    box.appendChild(settledNode);
    tailSpans = [];
    for (var i = 0; i < TAIL_STEPS; i++) {
      var span = document.createElement("span");
      // color-mix against the variables rather than a colour worked out here,
      // so the trail follows the accent picker and the theme with no redraw.
      span.style.color = "color-mix(in srgb, var(--accent) " +
        Math.round(((i + 1) / TAIL_STEPS) * 100) + "%, var(--text))";
      box.appendChild(span);
      tailSpans.push(span);
    }
  }

  function paintTrail(shown) {
    trailNodes();
    var tailStart = Math.max(0, shown.length - TAIL_CHARS);
    settledNode.nodeValue = shown.slice(0, tailStart);
    var tail = shown.slice(tailStart);
    for (var i = 0; i < TAIL_STEPS; i++) {
      var from = Math.floor((i * tail.length) / TAIL_STEPS);
      var to = Math.floor(((i + 1) * tail.length) / TAIL_STEPS);
      tailSpans[i].textContent = tail.slice(from, to);
    }
  }

  function stopReveal() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // Never leave the box truncated if a reveal was cut short, and drop the
    // trail: nothing is arriving any more, so nothing should look like it is.
    if (target) box.textContent = target;
    settledNode = null;
    tailSpans = [];
    target = "";
    index = 0;
  }

  function beginReveal(text, speed) {
    stopReveal();
    target = text;
    index = 0;
    perTick = speedPerTick(speed, text.length);
    box.textContent = "";
    settledNode = null;
    box.classList.remove("placeholder");
    timer = setInterval(function () {
      index = Math.min(target.length, index + perTick);
      paintTrail(target.slice(0, index));
      box.scrollTop = box.scrollHeight;
      if (index >= target.length) stopReveal();
    }, 20);
  }

  function paint() {
    var text = content[active] || "";
    stopReveal();
    // A settled view is plain text; the trail belongs to text still arriving.
    settledNode = null;
    tailSpans = [];
    if (text) {
      box.textContent = text;
      box.classList.remove("placeholder");
    } else {
      box.textContent = root.dataset.placeholder || Muffin.t("transcribe.transcriptPlaceholder", "Transcript will appear here.");
      box.classList.add("placeholder");
    }
    if (copyBtn) copyBtn.disabled = !text;
    tabs.forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.tab === active);
      // A tab with nothing behind it would just show the placeholder.
      tab.disabled = !content[tab.dataset.tab];
    });
    if (tabs.length) tabs[0].disabled = false;
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      if (tab.disabled) return;
      active = tab.dataset.tab;
      paint();
    });
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var text = content[active] || "";
      if (!text) return;
      Muffin.invoke("app.copy", { text: text });
      if (window.showToast) showToast(Muffin.t("historyDetail.copiedTitle", "Copied!"));
    });
  }

  // "While you're waiting...", the current stage, and the support button, in
  // place of the transcript while the work runs. Ported from the mobile
  // WaitingCard: transcription is minutes of dead time, and it is the one
  // moment someone is genuinely idle and looking at the screen.
  //
  // No spinner, deliberately. The status line already moves through its stages
  // (converting, transcribing, improving), which says more than a spinner does.
  var waitingEl = null;

  function showWaiting(status) {
    if (!waitingEl) {
      waitingEl = document.createElement("div");
      waitingEl.className = "waiting-card";
      waitingEl.innerHTML =
        '<div class="w-title"></div><div class="w-status"></div>' +
        '<button class="btn btn-accent w-support"></button>';
      waitingEl.querySelector(".w-support").addEventListener("click", function () {
        if (window.showSupportDialog) window.showSupportDialog();
      });
    }
    waitingEl.querySelector(".w-title").textContent =
      Muffin.t("transcribe.whileWaiting", "While you're waiting...");
    var line = waitingEl.querySelector(".w-status");
    line.textContent = status || "";
    line.hidden = !status;
    waitingEl.querySelector(".w-support").textContent =
      Muffin.t("transcribe.supportMe", "Support me!");

    if (waitingEl.parentNode !== root) {
      box.hidden = true;
      box.parentNode.insertBefore(waitingEl, box);
    }
  }

  function hideWaiting() {
    if (waitingEl && waitingEl.parentNode) waitingEl.parentNode.removeChild(waitingEl);
    box.hidden = false;
  }

  return {
    /**
     * Swaps the transcript for the waiting card while something is running.
     * Called with the latest status on every tick, including the ones too
     * frequent to announce, because here they are the point.
     */
    waiting: function (on, status) {
      if (on) showWaiting(status);
      else hideWaiting();
    },

    // The whole output at once. animate types the raw text out, but only when
    // the user asked for the typewriter.
    set: function (data, options) {
      options = options || {};
      // Whether the raw text is actually NEW, not merely whether there was none
      // before. The old test was "raw was empty", which is true the first time
      // a transcript arrives and false for a re-transcribe: the reveal simply
      // never ran on the library screen. Comparing the text also means a state
      // refresh carrying the same words does not replay the animation.
      var rawChanged = !!data.raw && data.raw !== content.raw;
      content = { raw: data.raw || "", formatted: data.formatted || "", summary: data.summary || "" };

      // An action shows what IT produced. Re-transcribing used to land on the
      // Summary tab because one happened to exist, so the fresh transcript was
      // replaced a moment later by an older summary.
      if (options.show && content[options.show]) active = options.show;
      else if (content.summary && options.preferBest) active = "summary";
      else if (content.formatted && options.preferBest) active = "formatted";
      else if (!content[active]) active = "raw";

      if (options.animate && rawChanged && active === "raw") {
        tabs.forEach(function (tab) {
          tab.classList.toggle("active", tab.dataset.tab === "raw");
          tab.disabled = !content[tab.dataset.tab];
        });
        if (copyBtn) copyBtn.disabled = false;
        beginReveal(content.raw, options.speed || "Balanced");
        return;
      }
      paint();
    },

    // A tab growing as the model streams into it.
    stream: function (tab, text) {
      content[tab] = text;
      // The model writing into a tab is text arriving too, so it gets the same
      // trail. stopReveal() is not called here: it would rewrite the whole box
      // and throw the trail nodes away on every chunk.
      if (timer) { clearInterval(timer); timer = null; target = ""; index = 0; }
      if (active !== tab) { active = tab; box.textContent = ""; settledNode = null; }
      paintTrail(text);
      box.classList.remove("placeholder");
      box.scrollTop = box.scrollHeight;
      tabs.forEach(function (t) {
        t.classList.toggle("active", t.dataset.tab === tab);
        t.disabled = !content[t.dataset.tab];
      });
      if (copyBtn) copyBtn.disabled = !text;
    },

    show: function (tab) { active = tab; paint(); },
    text: function () { return content[active] || ""; },
    clear: function () { content = { raw: "", formatted: "", summary: "" }; active = "raw"; paint(); },
    repaint: paint,
  };
}
