// The transcript panel, shared by the transcribe screen and the library detail,
// the same way the mobile app shares TranscriptPanel between them. Fix a layout
// quirk here and both screens get it.
//
// The typewriter reveal is the desktop one, unchanged: a 20ms tick, and chars
// per tick = max(base, ceil(length / 240)) with base 1 / 3 / 9 for
// Slow / Balanced / Fast, so a long transcript still finishes in about 5s.

function createTranscript(root) {
  var box = root.querySelector(".transcript");
  var tabs = root.querySelectorAll(".segment[data-tab]");
  var copyBtn = root.querySelector("[data-copy]");

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

  function stopReveal() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // Never leave the box truncated if a reveal was cut short.
    if (target && index < target.length) box.textContent = target;
    target = "";
    index = 0;
  }

  function beginReveal(text, speed) {
    stopReveal();
    target = text;
    index = 0;
    perTick = speedPerTick(speed, text.length);
    box.textContent = "";
    box.classList.remove("placeholder");
    timer = setInterval(function () {
      index = Math.min(target.length, index + perTick);
      box.textContent = target.slice(0, index);
      box.scrollTop = box.scrollHeight;
      if (index >= target.length) stopReveal();
    }, 20);
  }

  function paint() {
    var text = content[active] || "";
    stopReveal();
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

  return {
    // The whole output at once. animate types the raw text out, but only when
    // the user asked for the typewriter.
    set: function (data, options) {
      options = options || {};
      var wasRaw = !content.raw && data.raw;
      content = { raw: data.raw || "", formatted: data.formatted || "", summary: data.summary || "" };

      // An action shows what IT produced. Re-transcribing used to land on the
      // Summary tab because one happened to exist, so the fresh transcript was
      // replaced a moment later by an older summary.
      if (options.show && content[options.show]) active = options.show;
      else if (content.summary && options.preferBest) active = "summary";
      else if (content.formatted && options.preferBest) active = "formatted";
      else if (!content[active]) active = "raw";

      if (options.animate && wasRaw && active === "raw" && content.raw) {
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
      active = tab;
      stopReveal();
      box.textContent = text;
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
