/* MyPhoto frontend: gallery, person filter, rename, analysis progress. */

const folderInput = document.getElementById("folder-input");
const analyzeBtn = document.getElementById("analyze-btn");
const progressWrap = document.getElementById("progress-wrap");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const gallery = document.getElementById("gallery");
const emptyState = document.getElementById("empty-state");
const personsBox = document.getElementById("persons");
const personsEmpty = document.getElementById("persons-empty");
const filterBanner = document.getElementById("filter-banner");
const filterName = document.getElementById("filter-name");
const clearFilterBtn = document.getElementById("clear-filter");
const lightbox = document.getElementById("lightbox");
const lightboxFrame = document.getElementById("lightbox-frame");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");

let activePersonId = null;
let personsCache = [];
let pollTimer = null;

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

/* ------------------------------------------------------------- rendering */

function faceBoxesHtml(photo) {
  return photo.faces
    .map((f) => {
      const left = (f.x / photo.width) * 100;
      const top = (f.y / photo.height) * 100;
      const w = (f.w / photo.width) * 100;
      const h = (f.h / photo.height) * 100;
      const name = f.person_name || "Unknown";
      return `<div class="face-box" style="left:${left}%;top:${top}%;width:${w}%;height:${h}%">
                <div class="face-label">${escapeHtml(name)}</div>
              </div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function loadPhotos() {
  const q = activePersonId != null ? `?person_id=${activePersonId}` : "";
  const photos = await api(`/api/photos${q}`);

  gallery.innerHTML = photos
    .map(
      (p) => `
      <div class="card" data-photo-id="${p.id}">
        <div class="photo-frame">
          <img src="/api/thumb/${p.id}" loading="lazy" alt="${escapeHtml(p.filename)}">
          ${faceBoxesHtml(p)}
        </div>
        <div class="card-filename" title="${escapeHtml(p.path)}">${escapeHtml(p.filename)}</div>
      </div>`
    )
    .join("");

  emptyState.classList.toggle("hidden", photos.length > 0);

  gallery.querySelectorAll(".card").forEach((card) => {
    const photo = photos.find((p) => p.id === Number(card.dataset.photoId));
    card.addEventListener("click", () => openLightbox(photo));
  });
}

async function loadPersons() {
  personsCache = await api("/api/persons");
  personsEmpty.classList.toggle("hidden", personsCache.length > 0);

  personsBox.innerHTML = personsCache
    .map(
      (p) => `
      <div class="person ${p.id === activePersonId ? "active" : ""}" data-person-id="${p.id}">
        <img class="person-avatar" src="/api/face/${p.portrait_face_id}" alt="">
        <div class="person-meta">
          <div class="person-name" title="Click ✎ to rename">${escapeHtml(p.name)}</div>
          <div class="person-count">${p.photo_count} photo${p.photo_count === 1 ? "" : "s"}</div>
        </div>
        <button class="person-edit" title="Rename">✎</button>
      </div>`
    )
    .join("");

  personsBox.querySelectorAll(".person").forEach((el) => {
    const id = Number(el.dataset.personId);
    el.addEventListener("click", () => togglePersonFilter(id));
    el.querySelector(".person-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      startRename(el, id);
    });
  });

  updateFilterBanner();
}

function updateFilterBanner() {
  const person = personsCache.find((p) => p.id === activePersonId);
  filterBanner.classList.toggle("hidden", !person);
  if (person) filterName.textContent = person.name;
}

function togglePersonFilter(personId) {
  activePersonId = activePersonId === personId ? null : personId;
  loadPersons();
  loadPhotos();
}

clearFilterBtn.addEventListener("click", () => {
  activePersonId = null;
  loadPersons();
  loadPhotos();
});

/* ---------------------------------------------------------------- rename */

function startRename(personEl, personId) {
  const nameEl = personEl.querySelector(".person-name");
  const oldName = nameEl.textContent;
  const input = document.createElement("input");
  input.className = "person-name-input";
  input.value = oldName;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const newName = input.value.trim();
    if (save && newName && newName !== oldName) {
      try {
        await api(`/api/persons/${personId}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });
      } catch (err) {
        alert(err.message);
      }
    }
    await loadPersons();
    await loadPhotos(); // labels on photos use the person name
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (e) => e.stopPropagation());
}

/* -------------------------------------------------------------- analysis */

analyzeBtn.addEventListener("click", async () => {
  try {
    await api("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: folderInput.value }),
    });
    setAnalyzing(true);
    pollTimer = setInterval(pollProgress, 400);
  } catch (err) {
    alert(err.message);
  }
});

function setAnalyzing(on) {
  analyzeBtn.disabled = on;
  analyzeBtn.textContent = on ? "Analyzing…" : "Analyze";
  progressWrap.classList.toggle("hidden", !on);
}

async function pollProgress() {
  const p = await api("/api/progress");
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent =
    p.status === "running"
      ? `${p.done} / ${p.total} ${p.current ? "— " + p.current : ""}`
      : p.status;

  if (p.status === "running") {
    // Refresh people as they appear during the run.
    loadPersons();
  } else {
    clearInterval(pollTimer);
    pollTimer = null;
    setAnalyzing(false);
    if (p.status === "error") alert(`Analysis failed: ${p.error}`);
    await loadPersons();
    await loadPhotos();
  }
}

/* -------------------------------------------------------------- lightbox */

function openLightbox(photo) {
  lightboxImg.src = `/api/image/${photo.id}`;
  lightboxCaption.textContent = photo.path;
  lightboxFrame.querySelectorAll(".face-box").forEach((el) => el.remove());
  lightboxFrame.insertAdjacentHTML("beforeend", faceBoxesHtml(photo));
  lightbox.classList.remove("hidden");
}

lightbox.addEventListener("click", () => lightbox.classList.add("hidden"));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") lightbox.classList.add("hidden");
});

/* ------------------------------------------------------------------ init */

(async function init() {
  const cfg = await api("/api/config");
  folderInput.value = cfg.default_folder;

  const p = await api("/api/progress");
  if (p.status === "running") {
    setAnalyzing(true);
    pollTimer = setInterval(pollProgress, 400);
  }

  await loadPersons();
  await loadPhotos();
})();
