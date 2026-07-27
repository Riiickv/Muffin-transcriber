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
function openCollapsible(box) {
  if (!box) return;
  box.classList.add("open");
  var head = box.querySelector(".collapsible-head");
  if (head) head.setAttribute("aria-expanded", "true");
}

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
});
