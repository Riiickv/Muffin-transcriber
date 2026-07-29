// Shared UI behaviour for the Muffin desktop screens.

// Replace every native <select> with a themed dropdown (the mobile
// SelectDropdown). The native <select> is kept, hidden, and its value stays in
// sync, so wiring it to the backend later is unchanged - it still fires change.
function enhanceSelects(root) {
  (root || document).querySelectorAll("select").forEach(function (sel) {
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = "1";

    var wrap = document.createElement("div");
    wrap.className = "dropdown";

    var field = document.createElement("button");
    field.type = "button";
    field.className = "dropdown-field";
    var value = document.createElement("span");
    value.className = "dropdown-value";
    var chevron = document.createElement("span");
    chevron.className = "msr chevron";
    chevron.textContent = ""; // expand_more
    field.appendChild(value);
    field.appendChild(chevron);

    var menu = document.createElement("div");
    menu.className = "dropdown-menu";

    // Rebuilt from the <select> itself, so the backend can swap the options
    // (models, languages) and the themed list follows with no extra wiring.
    function render() {
      menu.textContent = "";
      value.textContent = "";
      Array.prototype.forEach.call(sel.options, function (opt) {
        var row = document.createElement("div");
        row.className = "dropdown-opt";
        row.textContent = opt.textContent;
        if (opt.value === sel.value) {
          row.classList.add("selected");
          value.textContent = opt.textContent;
        }
        row.addEventListener("click", function () {
          sel.value = opt.value;
          wrap.classList.remove("open");
          render();
          sel.dispatchEvent(new Event("change"));
        });
        menu.appendChild(row);
      });
      if (!value.textContent) {
        value.textContent = sel.options.length ? sel.options[0].textContent : "";
      }
    }

    sel.render = render;
    render();

    field.addEventListener("click", function (e) {
      e.stopPropagation();
      if (sel.disabled) return;
      var wasOpen = menu.classList.contains("open");
      closeAllDropdowns();
      if (!wasOpen) openMenu(wrap, field, menu);
    });

    sel.style.display = "none";
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(field);
    wrap.appendChild(sel);
    // The menu is a child of <body>, not of the field: inside its own card it
    // was clipped by the card's overflow and cut off at the window's edge.
    menu._owner = wrap;
    document.body.appendChild(menu);
  });
}

// Places the menu in viewport coordinates: under the field when it fits, above
// it when it does not, never taller than the space it has.
function openMenu(wrap, field, menu) {
  var rect = field.getBoundingClientRect();
  var gap = 4;
  var margin = 8;
  var below = window.innerHeight - rect.bottom - gap - margin;
  var above = rect.top - gap - margin;
  var flip = below < 160 && above > below;
  var room = Math.max(120, Math.min(320, flip ? above : below));

  menu.style.left = Math.round(rect.left) + "px";
  menu.style.width = Math.round(rect.width) + "px";
  menu.style.maxHeight = Math.round(room) + "px";
  if (flip) {
    menu.style.top = "auto";
    menu.style.bottom = Math.round(window.innerHeight - rect.top + gap) + "px";
  } else {
    menu.style.bottom = "auto";
    menu.style.top = Math.round(rect.bottom + gap) + "px";
  }

  wrap.classList.add("open");
  menu.classList.add("open");

  // A hundred languages deep, the current one should be on screen already.
  var selected = menu.querySelector(".dropdown-opt.selected");
  if (selected) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight / 2);
}

// Redraw a themed dropdown after its <select> was changed from code.
function syncDropdown(sel) {
  if (sel && typeof sel.render === "function") sel.render();
}

// Replace a <select>'s options from [{value, label}] and redraw it.
function setOptions(sel, options, selected) {
  if (!sel) return;
  sel.textContent = "";
  options.forEach(function (o) {
    var opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  });
  if (selected !== undefined && selected !== null && selected !== "") sel.value = String(selected);
  if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
  enhanceSelects();
  syncDropdown(sel);
}

function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-menu.open").forEach(function (menu) {
    menu.classList.remove("open");
    if (menu._owner) menu._owner.classList.remove("open");
  });
}

// Only for switches that are NOT bound to a setting. A bound one is flipped and
// saved together by the bridge, because doing those in two handlers made the
// outcome depend on which one happened to be registered first.
function wireToggles() {
  document.querySelectorAll("[data-toggle], .switch").forEach(function (el) {
    if (el.dataset.toggleBound || el.dataset.setting) return;
    el.dataset.toggleBound = "1";
    el.addEventListener("click", function () {
      el.classList.toggle("on");
      el.setAttribute("aria-pressed", el.classList.contains("on"));
    });
  });
}

function wireSegments() {
  document.querySelectorAll(".segmented").forEach(function (group) {
    group.querySelectorAll(".segment").forEach(function (seg) {
      seg.addEventListener("click", function () {
        group.querySelectorAll(".segment").forEach(function (s) { s.classList.remove("active"); });
        seg.classList.add("active");
      });
    });
  });
}

// A labelled section that folds away. The prompt is optional detail, so it
// starts closed rather than taking up room on every screen.
function setCollapsible(box, open) {
  if (!box) return;
  box.classList.toggle("open", open);
  var head = box.querySelector(".collapsible-head");
  if (head) head.setAttribute("aria-expanded", open);
}

function openCollapsible(box) { setCollapsible(box, true); }

function wireCollapsibles() {
  document.querySelectorAll(".collapsible").forEach(function (box) {
    var head = box.querySelector(".collapsible-head");
    if (!head || head.dataset.bound) return;
    head.dataset.bound = "1";
    head.addEventListener("click", function () {
      var open = !box.classList.contains("open");
      box.classList.toggle("open", open);
      head.setAttribute("aria-expanded", open);
    });
  });
}
window.openCollapsible = openCollapsible;
window.setCollapsible = setCollapsible;

// ---- Dialogs ----------------------------------------------------------------
// The mobile DialogCard: centred icon, title and message, buttons in a row
// sharing the width. Every confirm, error and prompt in the app is one of
// these, so it is built once here rather than written into each page.
//
//   Muffin.dialog({
//     title, message,
//     icon: "", iconTone: "danger",
//     input: { value, placeholder, maxLength },   // optional text field
//     buttons: [{ label, variant, onPress(value) }],
//     onDismiss,
//   })
//
// variant is accent | ghost | danger; the last button defaults to accent.
function showDialog(opts) {
  var backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";

  var card = document.createElement("div");
  card.className = "dialog-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  backdrop.appendChild(card);

  // Artwork wins over a glyph when both are given, the way DialogCard does it.
  // It is drawn as a mask filled with the tone colour rather than as a picture,
  // so a one-colour mark follows the accent picker and reads on either theme.
  if (opts.image) {
    var art = document.createElement("span");
    art.className = "dialog-art" + (opts.iconTone === "danger" ? " danger" : "");
    art.style.webkitMaskImage = "url(" + opts.image + ")";
    art.style.maskImage = "url(" + opts.image + ")";
    art.style.width = Math.round(44 * (opts.imageAspect || 1)) + "px";
    card.appendChild(art);
  } else if (opts.icon) {
    var icon = document.createElement("span");
    icon.className = "msr fill dialog-icon" + (opts.iconTone === "danger" ? " danger" : "");
    icon.textContent = opts.icon;
    card.appendChild(icon);
  }

  var title = document.createElement("h2");
  title.className = "dialog-title";
  title.textContent = opts.title || "";
  card.appendChild(title);

  if (opts.message) {
    var msg = document.createElement("p");
    msg.className = "dialog-message";
    msg.textContent = opts.message;
    card.appendChild(msg);
  }

  var field = null;
  if (opts.input) {
    // One of ours, so the dialog's field gets the same caret and the same
    // rounded selection as everything else you can type in.
    field = document.createElement("div");
    field.className = "dialog-input";
    field.setAttribute("data-field", "");
    field.setAttribute("data-single-line", "");
    if (opts.input.placeholder) field.setAttribute("placeholder", opts.input.placeholder);
    makeField(field);
    field.value = opts.input.value || "";
    card.appendChild(field);
  }

  var row = document.createElement("div");
  row.className = "dialog-buttons";
  card.appendChild(row);

  var closed = false;
  function close(dismissed) {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    backdrop.classList.remove("open");
    // Let it fade before it leaves, the way the card arrived.
    setTimeout(function () { backdrop.remove(); }, 160);
    if (dismissed && opts.onDismiss) opts.onDismiss();
  }

  var buttons = opts.buttons && opts.buttons.length
    ? opts.buttons
    : [{ label: (window.Muffin && Muffin.t("dialog.defaultOk", "OK")) || "OK" }];

  buttons.forEach(function (spec, i) {
    var btn = document.createElement("button");
    var variant = spec.variant || (i === buttons.length - 1 ? "accent" : "ghost");
    btn.className = "btn btn-" + variant;
    btn.textContent = spec.label;
    btn.addEventListener("click", function () {
      var value = field ? field.value.trim() : undefined;
      close(false);
      if (spec.onPress) spec.onPress(value);
    });
    row.appendChild(btn);
  });

  // Clicking the scrim is the same exit as Escape, never a third outcome.
  backdrop.addEventListener("mousedown", function (e) { if (e.target === backdrop) close(true); });
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    if (e.key === "Enter" && field && document.activeElement === field) {
      e.preventDefault();
      row.lastElementChild.click();
    }
  }
  document.addEventListener("keydown", onKey, true);

  document.body.appendChild(backdrop);
  // Commit the closed state before opening, so the transition has something to
  // start from. A forced reflow rather than requestAnimationFrame: rAF does not
  // run while the window is in the background, and the dialog would sit there
  // invisible until the user touched something.
  void backdrop.offsetHeight;
  backdrop.classList.add("open");
  if (field) { field.focus(); field.select(); }
  else if (row.lastElementChild) row.lastElementChild.focus();

  return { close: function () { close(false); } };
}
window.showDialog = showDialog;

// ---- Right-click menu -------------------------------------------------------
// WebView2 shows Edge's own context menu: a wide list in the system font with
// Emoji, Web Select, Inspect and a translate entry, none of which belong in a
// transcriber. This is the app's, with the four commands that do.
var ctxEl = null;

// Only the places where a text command means something: the same places the
// stylesheet allows a selection. Right-clicking a nav button offered "Select
// all" before this, which selects a nav button.
var SELECTABLE = ".transcript, .bubble, .prompt, .search, .dialog-input, input, textarea, [contenteditable]";

function contextItems(target) {
  // The strip used to be a caption region, so this right-click never reached
  // the page: Windows answered it with Restore / Move / Size / Minimize /
  // Maximize / Close in its own grey box. Move and Size are keyboard-era
  // commands nobody reaches for, so the menu is the three that are real.
  if (target.closest && target.closest(".titlebar")) {
    var maximized = document.querySelector(".tb-max .tb-ico.restore");
    return [
      {
        label: maximized
          ? Muffin.t("pc.window.restore", "Restore")
          : Muffin.t("pc.window.maximize", "Maximize"),
        enabled: true,
        run: function () {
          Muffin.invoke("window.toggleMaximize").then(function (r) {
            if (window.paintMaxIcon) window.paintMaxIcon(r && r.maximized);
          });
        },
      },
      { label: Muffin.t("pc.window.minimize", "Minimize"), enabled: true, run: function () { Muffin.invoke("window.minimize"); } },
      { label: Muffin.t("pc.window.close", "Close"), enabled: true, run: function () { Muffin.invoke("window.close"); } },
    ];
  }

  var field = target.closest("input, textarea, [contenteditable]");
  var editable = field && !field.disabled && !field.readOnly;
  var text = target.closest(SELECTABLE);
  var selection = String(window.getSelection());
  // A contenteditable field's selection IS the document selection; an input
  // keeps its own, which is why the two are asked in different ways.
  var inField = editable && (field.isContentEditable
    ? selection.length > 0 && field.contains(window.getSelection().anchorNode)
    : field.selectionStart !== field.selectionEnd);
  var hasSelection = inField || (!field && selection.length > 0);

  if (!editable && !text && !hasSelection) return [];

  var items = [];
  if (editable) {
    items.push({ label: Muffin.t("pc.menu.cut", "Cut"), enabled: inField, run: function () { document.execCommand("cut"); } });
  }
  items.push({ label: Muffin.t("pc.menu.copy", "Copy"), enabled: hasSelection, run: function () { document.execCommand("copy"); } });
  if (editable) {
    items.push({
      label: Muffin.t("pc.menu.paste", "Paste"), enabled: true,
      run: function () {
        // execCommand("paste") is refused for security, so go through the API
        // and put the text in by hand.
        navigator.clipboard.readText().then(function (text) {
          field.focus();
          if (field.isContentEditable) {
            // insertText respects the live caret and keeps the undo stack.
            document.execCommand("insertText", false, text);
            return;
          }
          var start = field.selectionStart, end = field.selectionEnd;
          field.value = field.value.slice(0, start) + text + field.value.slice(end);
          field.selectionStart = field.selectionEnd = start + text.length;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        });
      },
    });
  }
  if (editable || text) {
    items.push({
      label: Muffin.t("pc.menu.selectAll", "Select all"), enabled: true,
      run: function () {
        if (editable) { field.focus(); field.select(); return; }
        var range = document.createRange();
        range.selectNodeContents(text);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      },
    });
  }
  return items;
}

function closeContextMenu() {
  if (ctxEl) { ctxEl.remove(); ctxEl = null; }
}

function openContextMenu(x, y, items) {
  closeContextMenu();
  ctxEl = document.createElement("div");
  ctxEl.className = "ctx-menu";
  items.forEach(function (item) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "ctx-item";
    row.textContent = item.label;
    row.disabled = !item.enabled;
    row.addEventListener("click", function () { closeContextMenu(); item.run(); });
    ctxEl.appendChild(row);
  });
  document.body.appendChild(ctxEl);

  // Placed in viewport coordinates, and never off the edge it was opened near.
  var size = ctxEl.getBoundingClientRect();
  var margin = 6;
  // The title bar is opaque and sits above everything, so a menu opened from
  // it started underneath the strip with its first command sliced in half.
  // Nothing may begin higher than the bar ends.
  var ceiling = document.body.classList.contains("has-titlebar") ? 44 : margin;
  var left = Math.min(x, window.innerWidth - size.width - margin);
  var top = Math.min(y, window.innerHeight - size.height - margin);
  ctxEl.style.left = Math.max(margin, left) + "px";
  ctxEl.style.top = Math.max(ceiling, top) + "px";
}

// The title bar is a caption region, so its right-click arrives from the app
// rather than from the DOM. Both need the same list and the same menu.
window.contextItems = contextItems;
window.openContextMenu = openContextMenu;

function wireContextMenu() {
  document.addEventListener("contextmenu", function (e) {
    // Nothing to offer on a button or an icon, and an empty menu is worse
    // than none: let those right-clicks do nothing at all.
    var items = contextItems(e.target);
    e.preventDefault();
    if (!items.length) return;
    openContextMenu(e.clientX, e.clientY, items);
  });
  document.addEventListener("mousedown", function (e) {
    if (ctxEl && !ctxEl.contains(e.target)) closeContextMenu();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeContextMenu(); });
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("scroll", function (e) {
    if (!scrolledInsideAPopup(e)) closeContextMenu();
  }, true);
}

// ---- Text fields ------------------------------------------------------------
// An <input> or a <textarea> is a black box. Its text lives inside the control
// rather than in the document, so the custom selection cannot reach it, and the
// only thing CSS can say about its caret is caret-color: there is no width, no
// weight. A 1px accent line on a dark field is what "not visible, and if it is
// custom then it's too thin" was.
//
// contenteditable puts the text back in the document. The selection layer then
// covers these like any other text, and the caret below is drawn rather than
// asked for. Everything marked data-field answers to .value and .select() the
// way the control it replaced did, so no screen had to change how it reads its
// own field.

function paintPlaceholder(el) {
  // :empty is not enough: an emptied contenteditable keeps a stray <br>.
  el.classList.toggle("is-empty", el.textContent.length === 0);
}

function makeField(el) {
  if (!el || el.dataset.fieldBound) return el;
  el.dataset.fieldBound = "1";
  el.setAttribute("contenteditable", "plaintext-only");
  el.setAttribute("role", "textbox");
  // Set here as well as in the markup, so a field built in JS is styled by the
  // same rules without every call site having to remember the attribute.
  el.setAttribute("data-field", "");

  Object.defineProperty(el, "value", {
    configurable: true,
    get: function () { return el.textContent; },
    set: function (v) {
      el.textContent = v == null ? "" : String(v);
      paintPlaceholder(el);
    },
  });

  el.select = function () {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  el.addEventListener("input", function () { paintPlaceholder(el); });

  // A one-line field must stay one line.
  if (el.hasAttribute("data-single-line")) {
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") e.preventDefault();
    });
  }

  // plaintext-only already strips markup on paste, but not on a drop, and a
  // drop is how a paragraph of styled text gets in.
  el.addEventListener("drop", function (e) {
    var text = e.dataTransfer && e.dataTransfer.getData("text/plain");
    if (text === undefined || text === null) return;
    e.preventDefault();
    el.focus();
    document.execCommand("insertText", false, text);
  });

  paintPlaceholder(el);
  return el;
}

function wireFields(root) {
  (root || document).querySelectorAll("[data-field]").forEach(makeField);
}
window.makeField = makeField;
window.wireFields = wireFields;

// ---- The caret --------------------------------------------------------------
// Hidden natively (caret-color: transparent) and drawn here instead, so it can
// have a width, the accent, and rounded ends like everything else.
var caretEl = null;
var caretFrame = 0;

function caretNode() {
  if (!caretEl) {
    caretEl = document.createElement("div");
    caretEl.className = "caret";
    document.body.appendChild(caretEl);
  }
  return caretEl;
}

// A collapsed range inside text reports a zero-width rect with a real height.
// An EMPTY field has no text node to measure at all, so the first line is
// worked out from the box itself rather than by inserting a probe node, which
// would fire input events and poison the undo stack just to take a measurement.
function caretGeometry(el, range) {
  var rect = range.getBoundingClientRect();
  if (rect.height) return { left: rect.left, top: rect.top, height: rect.height };

  var box = el.getBoundingClientRect();
  var style = getComputedStyle(el);
  var height = parseFloat(style.lineHeight);
  if (!isFinite(height)) height = parseFloat(style.fontSize) * 1.4;
  return {
    left: box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
    top: box.top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
    height: height,
  };
}

function paintCaret() {
  caretFrame = 0;
  var caret = caretNode();
  var el = document.activeElement;
  var sel = window.getSelection();

  if (!el || !el.isContentEditable || !sel || !sel.rangeCount || !sel.isCollapsed
      || !el.contains(sel.anchorNode)) {
    caret.classList.remove("on");
    return;
  }

  var at = caretGeometry(el, sel.getRangeAt(0));
  // A field that scrolls would otherwise draw its caret outside itself.
  var box = el.getBoundingClientRect();
  if (at.top + at.height < box.top - 1 || at.top > box.bottom + 1) {
    caret.classList.remove("on");
    return;
  }

  caret.style.left = at.left + "px";
  caret.style.top = at.top + "px";
  caret.style.height = at.height + "px";
  // Restart the blink so it stays solid while typing, the way a real one does.
  caret.classList.remove("on");
  void caret.offsetWidth;
  caret.classList.add("on");
}

function scheduleCaret() {
  if (!caretFrame) caretFrame = requestAnimationFrame(paintCaret);
}

function wireCaret() {
  document.addEventListener("selectionchange", scheduleCaret);
  document.addEventListener("input", scheduleCaret, true);
  document.addEventListener("focusin", scheduleCaret);
  document.addEventListener("focusout", scheduleCaret);
  window.addEventListener("scroll", scheduleCaret, true);
  window.addEventListener("resize", scheduleCaret);
}

// ---- Tooltips ---------------------------------------------------------------
// Windows' own tooltip is a pale box in the system font that appears after a
// second and ignores the theme entirely. This replaces it.
//
// The text is still authored as title="" in the markup, and the i18n pass still
// writes there, but no title ever survives on the page: every one is moved to
// data-tip the moment it appears. Stashing it on hover instead was not enough
// and the support button proved it, drawing both tooltips side by side. The
// browser reads title when the pointer comes to rest, and that can happen
// before a hover delay has elapsed, so the only reliable answer is for the
// attribute never to be there at all.
var tipEl = null;
var tipTimer = 0;
var tipOwner = null;

/**
 * Moves a title to data-tip. aria-label carries the text on to a screen reader,
 * which is what the title was doing for these icon buttons.
 */
function stripTitle(el) {
  if (!el || !el.getAttribute) return;
  var text = el.getAttribute("title");
  if (text === null) return;
  el.removeAttribute("title");
  if (!text) return;
  // Overwritten, not filled in once: the mic button rewrites its label every
  // time recording starts or stops, and keeping the first one left the app's
  // tooltip saying "Start recording" while Windows' said "Stop recording".
  el.dataset.tip = text;
  el.setAttribute("aria-label", text);
}

function stripNativeTitles(root) {
  (root || document).querySelectorAll("[title]").forEach(stripTitle);
}
window.stripNativeTitles = stripNativeTitles;

// A sweep can only clean what is there when it runs, and screens set titles
// from state long after boot. This catches every one, whenever it is written.
var titleWatch = new MutationObserver(function (records) {
  records.forEach(function (record) { stripTitle(record.target); });
});

function tipNode() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tooltip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTip(el) {
  var text = el.dataset.tip;
  if (!text) return;
  tipOwner = el;

  var tip = tipNode();
  tip.textContent = text;
  // Closed it is hidden but still laid out, so it can be measured before it is
  // placed and never appears in the wrong spot first.
  tip.classList.remove("open", "below", "beside");

  var host = el.getBoundingClientRect();
  var size = tip.getBoundingClientRect();
  var gap = 8;
  var margin = 6;
  var top, left;

  // Above a button is right for a toolbar and wrong for the rail, where it
  // would sit on top of the next button up. A container says which it wants.
  var placer = el.closest("[data-tip-place]");
  var beside = placer && placer.dataset.tipPlace === "right";

  if (beside) {
    left = host.right + gap;
    if (left + size.width + margin > window.innerWidth) left = host.left - gap - size.width;
    top = host.top + host.height / 2 - size.height / 2;
    top = Math.max(margin, Math.min(window.innerHeight - size.height - margin, top));
  } else {
    var below = host.top - size.height - gap < margin;
    top = below ? host.bottom + gap : host.top - size.height - gap;
    left = host.left + host.width / 2 - size.width / 2;
    left = Math.max(margin, Math.min(window.innerWidth - size.width - margin, left));
    tip.classList.toggle("below", below);
  }

  tip.style.left = Math.round(left) + "px";
  tip.style.top = Math.round(top) + "px";
  tip.classList.toggle("beside", !!beside);
  tip.classList.add("open");
}

function hideTip() {
  clearTimeout(tipTimer);
  if (tipEl) tipEl.classList.remove("open");
}

function releaseTip() {
  hideTip();
  tipOwner = null;
}

function tipTarget(node) {
  if (!node || !node.closest) return null;
  var el = node.closest("[data-tip]");
  return el && el.dataset.tip ? el : null;
}

function wireTooltips() {
  stripNativeTitles();
  titleWatch.observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ["title"],
  });
  document.addEventListener("mouseover", function (e) {
    var el = tipTarget(e.target);
    if (!el) return;
    // Same element, already showing: nothing to do. Same element after a click
    // hid the tip: schedule it again.
    if (el === tipOwner && tipEl && tipEl.classList.contains("open")) return;
    if (tipOwner && tipOwner !== el) releaseTip();
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { showTip(el); }, 350);
  });
  document.addEventListener("mouseout", function (e) {
    if (tipOwner && tipTarget(e.relatedTarget) === tipOwner) return;
    releaseTip();
  });
  // Keyboard users get the same text, immediately: they cannot hover for it.
  document.addEventListener("focusin", function (e) {
    var el = tipTarget(e.target);
    if (el) { releaseTip(); showTip(el); }
  });
  document.addEventListener("focusout", releaseTip);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });
  // A tip pinned to the viewport would hang in mid-air once the page moved.
  window.addEventListener("scroll", hideTip, true);
  window.addEventListener("resize", hideTip);
  document.addEventListener("click", hideTip);
}

function wireSwatches() {
  document.querySelectorAll(".swatches").forEach(function (group) {
    group.querySelectorAll(".swatch").forEach(function (sw) {
      sw.addEventListener("click", function () {
        group.querySelectorAll(".swatch").forEach(function (s) { s.classList.remove("selected"); });
        sw.classList.add("selected");
      });
    });
  });
}

// A .splitter resizes its previous sibling's width on drag. data-min/data-max
// clamp it. Used between the History list/detail and the Chat sessions/main.
function wireSplitters() {
  document.querySelectorAll(".splitter").forEach(function (sp) {
    var target = sp.previousElementSibling;
    if (!target) return;
    var min = parseInt(sp.dataset.min || "200", 10);
    var max = parseInt(sp.dataset.max || "640", 10);
    var dragging = false;
    sp.addEventListener("mousedown", function (e) { dragging = true; document.body.style.cursor = "col-resize"; e.preventDefault(); });
    window.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var w = e.clientX - target.getBoundingClientRect().left;
      target.style.width = Math.max(min, Math.min(max, w)) + "px";
    });
    window.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = "";
      if (sp.dataset.persist && window.Muffin) {
        window.Muffin.set(sp.dataset.persist, Math.round(target.getBoundingClientRect().width));
      }
    });
  });
}

// The rail is the mobile tab bar. Each screen is its own document, so state
// lives in C# and every page asks for it on load.
function wireRail() {
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach(function (el) {
    el.addEventListener("click", function () {
      var target = el.dataset.nav;
      // Compare the destination, NOT the .active class: the Models screen marks
      // Settings active to show where you are, and skipping on .active made
      // that button dead with no way back through the rail.
      if (!target || target === here) return;
      location.href = target;
    });
  });
}

document.addEventListener("click", closeAllDropdowns);
// A menu pinned to the viewport would hang in mid-air once the page moved.
window.addEventListener("resize", closeAllDropdowns);

// ...but scrolling INSIDE the menu is the user reading it, not the page moving
// under it. This listener is on capture, so it saw those scrolls too and shut
// the menu on the first notch of the wheel: a hundred languages, and no way to
// reach any but the first few.
function scrolledInsideAPopup(e) {
  var node = e.target;
  return !!(node && node.nodeType === 1 && node.closest && node.closest(".dropdown-menu, .ctx-menu"));
}

window.addEventListener("scroll", function (e) {
  if (scrolledInsideAPopup(e)) return;
  closeAllDropdowns();
}, true);

/* ---- Custom text selection ----
   Windows draws the highlight itself: a hard-edged rectangle in the system
   colour, and the last piece of the desktop still showing through the text.
   ::selection can recolour it but cannot round it, so this hides the native
   paint and traces the live Range instead, drawing one rounded rect per line.

   Only the PAINT is replaced. The real selection is untouched, so Ctrl+C, the
   context menu, Ctrl+A and drag-select all behave exactly as they did.

   The one thing this cannot cover is <input> and <textarea>: their text lives
   inside the control rather than in the document, so a Range never reaches it
   and there are no rects to trace. Those keep the flat accent highlight, which
   is why the ::selection rule is still there. */
var SEL_MAX_RECTS = 240;
var selLayer = null;
var selFrame = 0;

// getClientRects() returns one rect per line box PER ELEMENT, and the
// transcript splits its last 44 characters across nine trail spans. Without
// this, selecting the end of a streaming transcript would draw nine separate
// pills on one line. Rects that sit on the same line and touch become one.
//
// The sort is not decoration. Those rects come back grouped by element, not in
// reading order: a span that wraps contributes a rect on line 4 and another on
// line 5 before the next span contributes its own line 4. Merging against only
// the previous entry therefore missed most of the pairs AND left overlapping
// rects, which at 32% alpha stack into visibly darker patches mid-line.
function mergeSelRects(rects) {
  var sorted = [];
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (r.width < 0.5 || r.height < 0.5) continue;
    sorted.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
  }
  sorted.sort(function (a, b) {
    return (Math.round(a.top) - Math.round(b.top)) || (a.left - b.left);
  });

  var out = [];
  for (var j = 0; j < sorted.length; j++) {
    var s = sorted[j];
    var last = out.length ? out[out.length - 1] : null;
    if (last && Math.abs(last.top - s.top) < 1.5 && Math.abs(last.bottom - s.bottom) < 1.5 &&
        s.left <= last.right + 1.5) {
      last.right = Math.max(last.right, s.right);
      continue;
    }
    out.push(s);
  }
  return out;
}

function paintSelection() {
  selFrame = 0;
  if (!selLayer) return;
  var sel = window.getSelection();
  var rects = [];
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    var merged = mergeSelRects(sel.getRangeAt(0).getClientRects());
    var vh = window.innerHeight;
    var vw = window.innerWidth;
    for (var i = 0; i < merged.length && rects.length < SEL_MAX_RECTS; i++) {
      var m = merged[i];
      // Only what is actually on screen. A two-hour transcript selected whole
      // is thousands of lines, and all but a screenful of them are invisible.
      if (m.bottom < 0 || m.top > vh || m.right < 0 || m.left > vw) continue;
      rects.push(m);
    }
  }

  // The nodes are pooled rather than rebuilt: this runs on every frame of a
  // drag-select, and churning the DOM there is what makes custom selection
  // feel worse than the native one.
  while (selLayer.childNodes.length > rects.length) selLayer.removeChild(selLayer.lastChild);
  while (selLayer.childNodes.length < rects.length) selLayer.appendChild(document.createElement("div"));
  for (var j = 0; j < rects.length; j++) {
    var box = rects[j];
    var node = selLayer.childNodes[j];
    // Grown slightly past the glyphs so descenders and the first character are
    // not clipped by the rounding, the way the native highlight pads them.
    node.style.left = (box.left - 2.5) + "px";
    node.style.top = (box.top - 1) + "px";
    node.style.width = (box.right - box.left + 5) + "px";
    node.style.height = (box.bottom - box.top + 2) + "px";
  }
}

function scheduleSelection() {
  if (!selFrame) selFrame = requestAnimationFrame(paintSelection);
}

function wireSelection() {
  selLayer = document.createElement("div");
  selLayer.className = "sel-layer";
  document.body.appendChild(selLayer);
  // Set from here, never in the markup: if this function ever throws, the class
  // is missing and the native highlight is still painted. A selection you
  // cannot see is a far worse failure than one that looks like Windows.
  document.body.classList.add("sel-custom");
  document.addEventListener("selectionchange", scheduleSelection);
  window.addEventListener("scroll", scheduleSelection, true);
  window.addEventListener("resize", scheduleSelection);
}

document.addEventListener("DOMContentLoaded", function () {
  enhanceSelects();
  wireToggles();
  wireSegments();
  wireSwatches();
  wireCollapsibles();
  wireSplitters();
  wireRail();
  wireFields();
  wireCaret();
  wireTooltips();
  wireContextMenu();
  wireSelection();
});
