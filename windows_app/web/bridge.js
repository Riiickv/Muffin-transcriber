// The bridge between the web UI and the C# backend.
//
// Everything the screens need from the app goes through Muffin.invoke(), which
// posts a message to the WebView2 host and resolves when C# answers. The host
// pushes state back the other way through Muffin.on().
//
// Opened in a plain browser (no WebView2 host) every call resolves to null and
// the page keeps whatever static content is in the HTML. That is deliberate:
// the screens have to stay previewable outside the app.

(function () {
  var host = (window.chrome && window.chrome.webview) || null;
  var pending = {};
  var nextId = 1;
  var listeners = {};
  var strings = {};
  var settings = {};

  function invoke(method, args) {
    if (!host) return Promise.resolve(null);
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      host.postMessage(JSON.stringify({ id: id, method: method, args: args === undefined ? null : args }));
    });
  }

  function on(event, handler) {
    (listeners[event] || (listeners[event] = [])).push(handler);
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(function (h) {
      try { h(payload); } catch (e) { console.error(event, e); }
    });
  }

  if (host) {
    host.addEventListener("message", function (e) {
      var msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      if (msg.id) {
        var p = pending[msg.id];
        delete pending[msg.id];
        if (!p) return;
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error || "bridge call failed"));
        return;
      }
      if (msg.event) emit(msg.event, msg.payload);
    });
  }

  // ---- translation -------------------------------------------------------
  // The English text sits in the HTML and doubles as the fallback, so the pages
  // read correctly in a browser and never blank out on a missing key.

  function t(key, fallback) {
    var v = strings[key];
    return v === undefined || v === "" ? (fallback || key) : v;
  }

  function applyStrings(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(function (el) {
      if (el.dataset.i18nFallback === undefined) el.dataset.i18nFallback = el.textContent;
      el.textContent = t(el.dataset.i18n, el.dataset.i18nFallback);
    });
    // data-i18n-attr="placeholder:transcribe.customPromptPlaceholder, title:common.copy"
    (root || document).querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.dataset.i18nAttr.split(",").forEach(function (pair) {
        var bits = pair.split(":");
        if (bits.length !== 2) return;
        var attr = bits[0].trim();
        var key = bits[1].trim();
        var store = "i18nFb" + attr;
        if (el.dataset[store] === undefined) el.dataset[store] = el.getAttribute(attr) || "";
        el.setAttribute(attr, t(key, el.dataset[store]));
      });
    });
  }

  // ---- theme -------------------------------------------------------------

  function applyTheme(theme) {
    if (!theme) return;
    var root = document.documentElement;
    if (theme.accent) root.style.setProperty("--accent", theme.accent);
    if (theme.onAccent) root.style.setProperty("--on-accent", theme.onAccent);
    if (theme.mode) root.setAttribute("data-theme", theme.mode);
  }

  // ---- settings ----------------------------------------------------------
  // A control tagged data-setting is bound both ways with no per-screen code:
  // it renders the stored value and writes back on change.

  function readSettings(next) {
    settings = next || {};
    document.querySelectorAll("[data-setting]").forEach(function (el) {
      var value = settings[el.dataset.setting];
      if (value === undefined) return;

      if (el.classList.contains("switch")) {
        el.classList.toggle("on", !!value);
        el.setAttribute("aria-pressed", !!value);
      } else if (el.classList.contains("segmented")) {
        el.querySelectorAll(".segment").forEach(function (seg) {
          seg.classList.toggle("active", seg.dataset.value === String(value));
        });
      } else if (el.classList.contains("swatches")) {
        el.querySelectorAll(".swatch").forEach(function (sw) {
          sw.classList.toggle("selected", sw.dataset.value === String(value));
        });
      } else if (el.tagName === "SELECT") {
        el.value = String(value);
        if (window.syncDropdown) window.syncDropdown(el);
      } else if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        if (document.activeElement !== el) el.value = value == null ? "" : String(value);
      }
    });
  }

  function set(key, value) {
    settings[key] = value;
    return invoke("settings.set", { key: key, value: value });
  }

  function get(key) {
    return settings[key];
  }

  // Wires every data-setting control on the page. Called after bootstrap.
  function bindSettings() {
    document.querySelectorAll("[data-setting]").forEach(function (el) {
      if (el.dataset.settingBound) return;
      el.dataset.settingBound = "1";
      var key = el.dataset.setting;

      if (el.classList.contains("switch")) {
        // This flips the switch AND saves it, in that order, in ONE handler.
        // Splitting the two across muffin.js and here made the result depend on
        // which listener was registered first: the app was handed the value from
        // before the click, then echoed it back and the switch sprang shut.
        el.addEventListener("click", function () {
          var on = !el.classList.contains("on");
          el.classList.toggle("on", on);
          el.setAttribute("aria-pressed", on);
          set(key, on);
        });
      } else if (el.classList.contains("segmented")) {
        el.querySelectorAll(".segment").forEach(function (seg) {
          seg.addEventListener("click", function () { set(key, seg.dataset.value); });
        });
      } else if (el.classList.contains("swatches")) {
        el.querySelectorAll(".swatch").forEach(function (sw) {
          sw.addEventListener("click", function () { set(key, sw.dataset.value); });
        });
      } else if (el.tagName === "SELECT") {
        el.addEventListener("change", function () { set(key, el.value); });
      } else if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        var timer = null;
        el.addEventListener("input", function () {
          clearTimeout(timer);
          timer = setTimeout(function () { set(key, el.value); }, 400);
        });
        el.addEventListener("blur", function () { clearTimeout(timer); set(key, el.value); });
      }
    });
  }

  // ---- startup -----------------------------------------------------------
  // One round trip hands the page its language, theme and settings before it is
  // shown, so nothing flashes English or blue on the way in.

  var readyHandlers = [];
  var isReady = false;
  var bootData = null;
  var CACHE_KEY = "muffin.bootstrap";

  function ready(fn) {
    if (isReady) fn();
    else readyHandlers.push(fn);
  }

  var appliedStrings = null;

  function apply(data) {
    if (!data) return;
    bootData = data;
    // Announce it rather than leaving it for a one-shot ready handler: with the
    // boot cache, ready fires on the cached payload and the fresh one that
    // actually carries the banner would never be seen.
    if (data.banner) emit("app.banner", data.banner);

    strings = data.strings || {};

    // Only when they actually changed. applyStrings() repaints the text of
    // every data-i18n element, and several of those are written by the screen
    // from app state: the Pick file button, the Go button, the library's three
    // action buttons, the chat's title. With the boot cache this runs twice on
    // every navigation, once from the cache and once when the real payload
    // lands, and the second pass wiped whatever the screen had put there. The
    // file you had picked was still queued in the app; the button had simply
    // been told to say "Pick file" again.
    var fingerprint = JSON.stringify(strings);
    if (fingerprint !== appliedStrings) {
      appliedStrings = fingerprint;
      applyStrings();
    }

    applyTheme(data.theme);
    readSettings(data.settings);
  }

  function markReady() {
    bindSettings();
    document.body.classList.add("booted");
    if (isReady) return;
    isReady = true;
    readyHandlers.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    readyHandlers = [];
  }

  // Every screen is its own document, so each switch used to wait on a round
  // trip to C# before it was allowed to show anything. The last payload is kept
  // for the session and painted immediately, then refreshed underneath.
  function boot() {
    try {
      var cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        apply(JSON.parse(cached));
        markReady();
      }
    } catch (e) {
      // No cache, a corrupt one, or storage denied: fall through to the call.
    }

    return invoke("app.bootstrap").then(function (data) {
      if (data) {
        apply(data);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { }
      }
      markReady();
      return data;
    });
  }

  on("strings.changed", function (payload) {
    strings = (payload && payload.strings) || {};
    appliedStrings = JSON.stringify(strings);
    applyStrings();
    if (bootData) {
      bootData.strings = strings;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(bootData)); } catch (e) { }
    }
    emit("retranslate");
  });
  on("theme.changed", function (theme) {
    applyTheme(theme);
    if (bootData) {
      bootData.theme = theme;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(bootData)); } catch (e) { }
    }
  });
  on("settings.changed", function (payload) {
    readSettings(payload);
    if (bootData) {
      bootData.settings = payload;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(bootData)); } catch (e) { }
    }
  });

  window.Muffin = {
    invoke: invoke,
    on: on,
    t: t,
    applyStrings: applyStrings,
    settings: function () { return settings; },
    data: function () { return bootData; },
    get: get,
    set: set,
    ready: ready,
    isHosted: !!host,
  };

  document.addEventListener("DOMContentLoaded", function () {
    // The page is hidden until it has its strings and theme. If the app never
    // answers, show it anyway rather than leaving a blank window.
    setTimeout(function () { document.body.classList.add("booted"); }, 1500);
    boot();
  });
})();
