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

  function render(models) {
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
              '<button class="m-cancel"><span class="msr" style="font-size:20px">&#xE5CD;</span></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="m-track" hidden><i style="width:0%"></i></div>';

      wrap.querySelector(".m-name").textContent = model.name;
      host.appendChild(wrap);

      rows[model.file] = { el: wrap, model: model, info: null };

      wrap.querySelector(".m-get").addEventListener("click", function () { download(model.file); });
      wrap.querySelector(".m-del").addEventListener("click", function () { remove(model.file); });
      wrap.querySelector(".m-cancel").addEventListener("click", function () {
        Muffin.invoke("models.cancel", { file: model.file });
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
    paint(p.file);
  });

  Muffin.on("models.done", function (e) {
    var entry = rows[e.file];
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
