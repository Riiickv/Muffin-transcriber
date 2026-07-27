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

// ---- Tooltips ---------------------------------------------------------------
// Windows' own tooltip is a yellow-white box in the system font that appears
// after a second and ignores the theme entirely. This replaces it without any
// markup change: title="" is still where the text lives (and still what the
// i18n pass writes to), it is just moved out of the way on hover so the native
// one never fires, and put back when the pointer leaves.
var tipEl = null;
var tipTimer = 0;
var tipOwner = null;

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
  var text = el.getAttribute("title") || el.dataset.tip;
  if (!text) return;
  // Stash it: an element with no title cannot raise the native tooltip.
  if (el.hasAttribute("title")) {
    el.dataset.tip = text;
    el.removeAttribute("title");
    // The text was the only label on most of these icon buttons, so it has to
    // keep reaching a screen reader now that the attribute is gone.
    if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", text);
  }
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

// Hiding and un-stashing are two different things. Clicking a button should
// hide the tip, but the pointer is still sitting on that button: hand the title
// attribute back now and Windows draws its own tooltip a second later, which is
// the thing this whole file exists to prevent. The title goes back only once
// the pointer has actually left.
function hideTip() {
  clearTimeout(tipTimer);
  if (tipEl) tipEl.classList.remove("open");
}

function releaseTip() {
  hideTip();
  if (!tipOwner) return;
  // Give the attribute back, so i18n and anything reading it still find it.
  if (tipOwner.dataset.tip) tipOwner.setAttribute("title", tipOwner.dataset.tip);
  tipOwner = null;
}

function tipTarget(node) {
  if (!node || !node.closest) return null;
  var el = node.closest("[title], [data-tip]");
  return el && (el.getAttribute("title") || el.dataset.tip) ? el : null;
}

function wireTooltips() {
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
window.addEventListener("scroll", closeAllDropdowns, true);
document.addEventListener("DOMContentLoaded", function () {
  enhanceSelects();
  wireToggles();
  wireSegments();
  wireSwatches();
  wireCollapsibles();
  wireSplitters();
  wireRail();
  wireTooltips();
});
