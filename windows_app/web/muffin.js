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
      var wasOpen = wrap.classList.contains("open");
      closeAllDropdowns();
      if (!wasOpen) wrap.classList.add("open");
    });

    sel.style.display = "none";
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(field);
    wrap.appendChild(menu);
    wrap.appendChild(sel);
  });
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
  document.querySelectorAll(".dropdown.open").forEach(function (d) { d.classList.remove("open"); });
}

function wireToggles() {
  document.querySelectorAll("[data-toggle], .switch").forEach(function (el) {
    if (el.dataset.toggleBound) return;
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
  document.querySelectorAll("[data-nav]").forEach(function (el) {
    el.addEventListener("click", function () {
      var target = el.dataset.nav;
      if (!target || el.classList.contains("active")) return;
      location.href = target;
    });
  });
}

document.addEventListener("click", closeAllDropdowns);
document.addEventListener("DOMContentLoaded", function () {
  enhanceSelects();
  wireToggles();
  wireSegments();
  wireSwatches();
  wireSplitters();
  wireRail();
});
