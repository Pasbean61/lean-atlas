/* Lean Atlas — interaction */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  const state = {
    lang: store.get("la-lang") || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en"),
    view: "front",
    sel: null,
    ex: null
  };
  const T = () => LA.t[state.lang];
  const L = (o) => (o ? o[state.lang] : "");
  const RX = (s) => state.lang === "zh" ? s : s.replace("/ 侧", "/ side").replace("力竭前 1–2 次", "1–2 shy of failure");

  /* exercise → owning muscle (first muscle that lists it) */
  const exOwner = {};
  for (const [id, m] of Object.entries(LA.muscles)) for (const k of m.ex) if (!exOwner[k]) exOwner[k] = id;

  /* ---------- figures ---------- */
  document.body.insertAdjacentHTML("afterbegin", LA.defs);
  for (const fig of $$(".body")) {
    const sex = fig.dataset.sex;
    LA.drawFigure($(".face.front", fig), sex, "front");
    LA.drawFigure($(".face.back", fig), sex, "back");
  }
  const figures = $("#figures");
  $("#stat-videos").textContent = Object.keys(LA.ex).length;

  /* ---------- hover + tooltip ---------- */
  const tip = $("#tip");
  let hotId = null;
  function setHot(id) {
    if (hotId === id) return;
    if (hotId) $$(`[data-m="${hotId}"]`).forEach((n) => n.classList.remove("hot"));
    hotId = id;
    if (id) $$(`[data-m="${id}"]`).forEach((n) => n.classList.add("hot"));
  }
  figures.addEventListener("pointerover", (e) => {
    const g = e.target.closest(".m");
    if (!g) return;
    setHot(g.dataset.m);
    const m = LA.muscles[g.dataset.m];
    tip.innerHTML = `<b>${esc(L(m))}</b><small>${esc(state.lang === "zh" ? m.en : m.lat.split(" · ")[0])}</small>`;
    tip.hidden = false;
  });
  figures.addEventListener("pointermove", (e) => {
    if (tip.hidden) return;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
  });
  figures.addEventListener("pointerout", (e) => {
    const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".m");
    if (!to) { setHot(null); tip.hidden = true; }
  });
  figures.addEventListener("click", (e) => {
    const g = e.target.closest(".m");
    if (!g) return;
    tip.hidden = true;
    open(g.dataset.m);
  });

  /* ---------- view toggle ---------- */
  function setView(v) {
    state.view = v;
    figures.classList.toggle("show-back", v === "back");
    $$(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  }
  $$(".seg button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  /* ---------- muscle index ---------- */
  function renderIndex() {
    const html = LA.regions.map((r) => {
      const items = Object.entries(LA.muscles).filter(([, m]) => m.r === r.id).map(([id, m]) =>
        `<button type="button" class="mbtn${state.sel === id ? " on" : ""}" id="mb-${id}" data-id="${id}"><span>${esc(L(m))}</span><small>${esc(state.lang === "zh" ? m.en : m.lat.split(" · ")[0])}</small></button>`
      ).join("");
      return `<div class="grp"><h3>${esc(L(r))}</h3>${items}</div>`;
    }).join("");
    $("#index").innerHTML = html;
  }
  $("#index").addEventListener("click", (e) => { const b = e.target.closest(".mbtn"); if (b) open(b.dataset.id, null, true); });
  $("#index").addEventListener("pointerover", (e) => { const b = e.target.closest(".mbtn"); if (b) setHot(b.dataset.id); });
  $("#index").addEventListener("pointerleave", () => setHot(null));

  /* ---------- selection + drawer ---------- */
  const drawer = $("#drawer"), scrim = $("#scrim"), din = $("#d-in");
  const narrow = () => matchMedia("(max-width: 860px)").matches;

  function paintSelection() {
    $$(".m.on, .m.sec").forEach((n) => n.classList.remove("on", "sec"));
    $$(".mbtn.on").forEach((n) => n.classList.remove("on"));
    figures.classList.toggle("has-sel", !!state.sel);
    if (!state.sel) return;
    $$(`.m[data-m="${state.sel}"]`).forEach((n) => n.classList.add("on"));
    const b = $("#mb-" + state.sel); if (b) b.classList.add("on");
    const ex = LA.ex[state.ex];
    if (ex) for (const s of ex.also) if (s !== state.sel) $$(`.m[data-m="${s}"]`).forEach((n) => n.classList.add("sec"));
  }

  function open(id, exKey, fromIndex) {
    const m = LA.muscles[id];
    if (!m) return;
    state.sel = id;
    state.ex = exKey && m.ex.includes(exKey) ? exKey : m.ex[0];
    const views = LA.viewsOf(id);
    if (!views.includes(state.view)) setView(views[0]);
    renderDrawer();
    paintSelection();
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("open"));
    document.body.classList.add("drawer-open");
    if (narrow()) scrim.hidden = false;
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    if (fromIndex && narrow()) figures.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function close() {
    state.sel = null; state.ex = null;
    drawer.classList.remove("open");
    document.body.classList.remove("drawer-open");
    scrim.hidden = true;
    setTimeout(() => { if (!state.sel) { drawer.hidden = true; din.innerHTML = ""; } }, 460);
    paintSelection();
    history.replaceState(null, "", location.pathname + location.search);
  }
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.sel) close(); });

  const ICON = {
    x: '<svg viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"/></svg>',
    yt: '<svg viewBox="0 0 24 24"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .6 12a31 31 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.8 31 31 0 0 0-.4-4.8zM9.7 15.1V8.9l5.8 3.1z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>'
  };

  function renderDrawer() {
    const id = state.sel, m = LA.muscles[id], t = T();
    const region = LA.regions.find((r) => r.id === m.r);
    const ex = LA.ex[state.ex];
    const views = LA.viewsOf(id).map((v) => `<span class="chip">${v === "front" ? t.viewOnFront : t.viewOnBack}</span>`).join("");
    const tabs = m.ex.map((k) =>
      `<button type="button" class="tab" role="tab" id="tab-${k}" data-k="${k}" aria-selected="${k === state.ex}">${esc(L(LA.ex[k].n))}</button>`).join("");
    const dots = [1, 2, 3].map((i) => `<i class="${i <= ex.lv ? "f" : ""}"></i>`).join("");
    const also = ex.also.filter((s) => s !== id).map((s) =>
      `<button type="button" class="chip" data-go="${s}">${esc(L(LA.muscles[s]))}</button>`).join("");
    const biliQ = encodeURIComponent(ex.n.zh + " 教学");

    din.innerHTML = `
      <div class="d-head">
        <div>
          <p class="eyebrow">${esc(L(region))}</p>
          <h2 id="d-title">${esc(L(m))}</h2>
          <p class="sub">${esc(state.lang === "zh" ? m.en : m.zh)}</p>
          <p class="lat">${esc(m.lat)}</p>
        </div>
        <button type="button" class="x" id="d-close" aria-label="${t.close}">${ICON.x}</button>
      </div>
      <div class="views">${views}</div>
      <p class="desc">${esc(L(m.d))}</p>
      <h3 class="d-h3">${t.exercises}</h3>
      <div class="tabs" role="tablist">${tabs}</div>
      <div class="video" id="video">
        <button type="button" class="poster" id="poster" style="background-image:url('https://i.ytimg.com/vi/${ex.v}/hqdefault.jpg')" aria-label="${t.play}: ${esc(L(ex.n))}">
          <span class="pl">${ICON.play}</span>
          <span class="cap"><span>${esc(L(ex.n))}</span><span>${ex.d}</span></span>
        </button>
      </div>
      <p class="credit">${t.credit} ${esc(ex.ch)} · YouTube · ${ex.d}</p>
      <dl class="meta">
        <div><dt>${t.sets}</dt><dd class="num">${esc(RX(ex.rx))}</dd></div>
        <div><dt>${t.rest}</dt><dd class="num">${esc(ex.rest)}</dd></div>
        <div><dt>${t.equip}</dt><dd>${esc(L(ex.eq))}</dd></div>
        <div><dt>${t.level}</dt><dd><span class="dots">${dots}</span>${t.lv[ex.lv]}</dd></div>
      </dl>
      <h3 class="d-h3">${t.cues}</h3>
      <ol class="cues">${L(ex.cues).map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
      ${also ? `<h3 class="d-h3">${t.alsoWorks}</h3><div class="also">${also}</div>` : ""}
      <div class="links">
        <a class="btn" href="https://www.youtube.com/watch?v=${ex.v}" target="_blank" rel="noopener">${ICON.yt}${t.openYt}</a>
        <a class="btn" href="https://search.bilibili.com/all?keyword=${biliQ}" target="_blank" rel="noopener">${ICON.search}${t.searchBili}</a>
      </div>`;

    $("#d-close").addEventListener("click", close);
    $$(".tab", din).forEach((b) => b.addEventListener("click", () => { state.ex = b.dataset.k; renderDrawer(); paintSelection(); }));
    $$("[data-go]", din).forEach((b) => b.addEventListener("click", () => open(b.dataset.go)));
    $("#poster").addEventListener("click", () => {
      $("#video").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ex.v}?autoplay=1&rel=0&modestbranding=1&playsinline=1${state.lang === "zh" ? "&cc_load_policy=1&cc_lang_pref=zh-Hans&hl=zh-CN" : ""}" title="${esc(L(ex.n))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    });
  }

  /* ---------- rules + plan ---------- */
  function renderRules() {
    $("#rule-grid").innerHTML = LA.rules.map((r) => `
      <article class="rule">
        <div class="n">${r.n}</div><span class="u">${esc(L(r.u))}</span>
        <h3>${esc(L(r.h))}</h3><p>${esc(L(r.p))}</p>
      </article>`).join("");
  }
  function renderPlan() {
    $("#plan-grid").innerHTML = LA.plan.map((day) => `
      <section class="day"><h3>${esc(L(day.d))}</h3><ol>${day.items.map((k) => {
        const ex = LA.ex[k], owner = LA.muscles[exOwner[k]];
        return `<li><button type="button" class="pbtn" data-ex="${k}"><b>${esc(L(ex.n))}</b><small>${esc(L(owner))}</small><em>${esc(RX(ex.rx))}</em></button></li>`;
      }).join("")}</ol></section>`).join("");
  }
  $("#plan-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".pbtn");
    if (!b) return;
    open(exOwner[b.dataset.ex], b.dataset.ex);
    $("#atlas").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------- language ---------- */
  function applyLang() {
    const t = T();
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
    $$("[data-t]").forEach((n) => { const v = t[n.dataset.t]; if (v != null) n.textContent = v; });
    $$(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
    renderIndex(); renderRules(); renderPlan();
    if (state.sel) { renderDrawer(); paintSelection(); }
  }
  $$(".lang button").forEach((b) => b.addEventListener("click", () => {
    state.lang = b.dataset.lang; store.set("la-lang", state.lang); applyLang();
  }));

  applyLang();

  /* deep link: #biceps opens that muscle */
  function fromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (LA.muscles[id]) open(id);
  }
  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
