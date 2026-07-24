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

    Array.prototype.forEach.call(sel.options, function (opt) {
      var row = document.createElement("div");
      row.className = "dropdown-opt";
      row.textContent = opt.textContent;
      if (opt.selected) {
        row.classList.add("selected");
        value.textContent = opt.textContent;
      }
      row.addEventListener("click", function () {
        sel.value = opt.value;
        value.textContent = opt.textContent;
        menu.querySelectorAll(".dropdown-opt").forEach(function (r) { r.classList.remove("selected"); });
        row.classList.add("selected");
        wrap.classList.remove("open");
        sel.dispatchEvent(new Event("change"));
      });
      menu.appendChild(row);
    });
    if (!value.textContent && sel.options.length) value.textContent = sel.options[0].textContent;

    field.addEventListener("click", function (e) {
      e.stopPropagation();
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

function closeAllDropdowns() {
  document.querySelectorAll(".dropdown.open").forEach(function (d) { d.classList.remove("open"); });
}

function wireToggles() {
  document.querySelectorAll("[data-toggle]").forEach(function (el) {
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

document.addEventListener("click", closeAllDropdowns);
document.addEventListener("DOMContentLoaded", function () {
  enhanceSelects();
  wireToggles();
  wireSegments();
});
