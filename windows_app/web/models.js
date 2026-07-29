// The downloadable model list, with progress, speed and ETA.
//
// One implementation, used by the Models screen AND the first-run setup, the
// same way the mobile app shares ModelDownloadList between them. A second copy
// would drift from this one the first time either changed.
//
// highlightRecommended draws the glow around the model suggested for this PC.
// The setup asks for it; the Models screen shows the same list without one.

function createModelList(host, options) {
  options = options || {};
  var rows = {};

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + " " + units[i];
  }

  function formatEta(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "...";
    if (seconds < 60) return Math.floor(seconds) + "s";
    return Math.floor(seconds / 60) + "m " + Math.floor(seconds % 60) + "s";
  }

  // `downloading` is {file: percent} for whatever the app has in flight. A
  // download keeps going while you are on another screen, and this list is
  // rebuilt from scratch every time the screen loads, so without it a running
  // download came back as a Download button that silently did nothing.
  function render(models, downloading) {
    host.textContent = "";
    rows = {};

    models.forEach(function (model) {
      var wrap = document.createElement("div");
      wrap.className = "m-item" + (options.highlightRecommended && model.recommended ? " suggested" : "");
      wrap.innerHTML =
        '<div class="m-row">' +
          '<div class="m-info"><div class="m-name"></div><div class="m-sub"></div></div>' +
          '<div class="m-actions">' +
            '<button class="m-get"></button>' +
            '<button class="m-del" hidden><span class="msr" style="font-size:18px">&#xE872;</span></button>' +
            '<div class="m-live" hidden>' +
              '<span class="m-pct"></span>' +
              '<button class="m-hold"><span class="msr" style="font-size:20px"></span></button>' +
              '<button class="m-cancel"><span class="msr" style="font-size:20px">&#xE5CD;</span></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="m-track" hidden><i style="width:0%"></i></div>';

      wrap.querySelector(".m-name").textContent = model.name;
      // Says WHY it is glowing. A pulsing outline on its own is decoration;
      // with the reason on it, it is a recommendation.
      if (options.highlightRecommended && model.recommended) {
        var badge = document.createElement("span");
        badge.className = "m-best";
        badge.textContent = Muffin.t("pc.models.recommended", "Best for this PC");
        wrap.querySelector(".m-name").appendChild(badge);
      }
      host.appendChild(wrap);

      // ActiveDownloads hands over {percent, paused, name} per file, not a bare
      // number: the rail needs the name and the paused flag too. Reading it as
      // a number put "[object Object]%" in the row.
      var live = downloading && Object.prototype.hasOwnProperty.call(downloading, model.file);
      var state = live ? downloading[model.file] : null;
      rows[model.file] = {
        el: wrap,
        model: model,
        info: live ? {
          percent: (state && typeof state === "object" ? state.percent : state) || 0,
          paused: !!(state && state.paused),
          downloaded: 0, total: 0, speed: 0, etaSeconds: 0,
        } : null,
      };

      if (live) paint(model.file);

      wrap.querySelector(".m-get").addEventListener("click", function () { download(model.file); });
      wrap.querySelector(".m-del").addEventListener("click", function () { remove(model.file); });
      wrap.querySelector(".m-cancel").addEventListener("click", function () {
        Muffin.invoke("models.cancel", { file: model.file });
      });

      wrap.querySelector(".m-hold").addEventListener("click", function () {
        var entry = rows[model.file];
        var paused = entry && entry.info && entry.info.paused;
        if (paused) {
          entry.info.paused = false;
          paint(model.file);
          Muffin.invoke("models.resume", { file: model.file });
        } else {
          Muffin.invoke("models.pause", { file: model.file });
        }
      });

      paint(model.file);
    });
  }

  function paint(file) {
    var entry = rows[file];
    if (!entry) return;

    var el = entry.el;
    var model = entry.model;
    var info = entry.info;
    var downloading = !!info;

    // While it downloads the subtitle is the download; otherwise it is what the
    // model is, which is what someone choosing between them needs to read.
    el.querySelector(".m-sub").textContent = downloading && info.total > 1
      ? formatBytes(info.downloaded) + " / " + formatBytes(info.total) +
        "  ·  " + formatBytes(info.speed * 1024 * 1024) + "/s" +
        "  ·  " + formatEta(info.etaSeconds)
      : model.size + (model.desc && model.desc !== model.size ? "  ·  " + model.desc : "");

    el.querySelector(".m-get").hidden = downloading || model.installed;
    el.querySelector(".m-get").textContent = Muffin.t("settings.get", "Get");
    el.querySelector(".m-del").hidden = downloading || !model.installed;
    el.querySelector(".m-del").title = Muffin.t("settings.delete", "Delete");
    el.querySelector(".m-live").hidden = !downloading;
    el.querySelector(".m-pct").textContent = (downloading ? info.percent || 0 : 0) + "%";

    // Pause keeps what has come down; cancel throws it away. On an 18 GB model
    // those are very different buttons, so they are two.
    var paused = downloading && info.paused;
    var hold = el.querySelector(".m-hold");
    hold.querySelector(".msr").textContent = paused ? "" : ""; // play / pause
    hold.dataset.tip = paused
      ? Muffin.t("downloads.resume", "Resume")
      : Muffin.t("downloads.pause", "Pause");
    el.classList.toggle("m-paused", !!paused);

    var track = el.querySelector(".m-track");
    track.hidden = !downloading;
    track.firstElementChild.style.width = (downloading ? info.percent || 0 : 0) + "%";
  }

  function download(file) {
    var entry = rows[file];
    if (!entry) return;
    entry.info = { percent: 0, downloaded: 0, total: 0, speed: 0, etaSeconds: 0 };
    paint(file);
    Muffin.invoke("models.download", { file: file });
  }

  function remove(file) {
    Muffin.invoke("models.delete", { file: file }).then(function () {
      if (window.showToast) showToast(Muffin.t("settings.deletedDesc", "Model deleted."));
      if (options.onChanged) options.onChanged();
    });
  }

  Muffin.on("models.progress", function (p) {
    var entry = rows[p.file];
    if (!entry) return;
    entry.info = p;
    entry.info.paused = false;
    paint(p.file);
  });

  Muffin.on("models.done", function (e) {
    var entry = rows[e.file];
    if (entry && e.paused) {
      // Paused, so the row keeps its progress and its buttons.
      entry.info = entry.info || { percent: e.percent || 0, downloaded: 0, total: 0, speed: 0, etaSeconds: 0 };
      entry.info.paused = true;
      entry.info.speed = 0;
      entry.info.etaSeconds = 0;
      paint(e.file);
      return;
    }
    if (entry) {
      entry.info = null;
      entry.model.installed = !!e.ok;
      paint(e.file);
    }
    if (e.error) showToast(Muffin.t("pc.models.downloadFailed", "Download failed!"));
    else if (e.cancelled) showToast(Muffin.t("pc.models.cancelled", "Download cancelled."));
    if (options.onChanged) options.onChanged();
  });

  return { render: render };
}
