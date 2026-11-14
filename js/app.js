/* Lean Atlas — page logic (drawer, language, index). The 3D stage lives in viewer.js. */
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
    sel: null, ex: null, parts: {}
  };
  const T = () => LA.t[state.lang];
  const L = (o) => (o ? o[state.lang] : "");
  const RX = (s) => state.lang === "zh" ? s : s.replace("/ 侧", "/ side").replace("力竭前 1–2 次", "1–2 shy of failure");
  const view = () => window.LAView;
  const narrow = () => matchMedia("(max-width: 860px)").matches;

  $("#stat-videos").textContent = Object.keys(LA.ex).length + Object.keys(LA.zhVideo).length;

  /* ---------- stage framing: keep the body clear of the side panels ---------- */
  const stageEl = $("#stage");
  function frameStage() {
    if (!view()) return;
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (narrow()) { view().setShift(0, state.sel ? h * 0.2 : 0); return; }
    const left = Math.min(430, w * 0.32), right = state.sel ? Math.min(480, w * 0.4) : 0;
    let a = left, b = w - right;
    if (b - a < 380) a = 0;
    view().setShift(w / 2 - (a + b) / 2, 0);
  }
  addEventListener("resize", frameStage);

  /* left column: titles and index share one flex column (they cannot overlap). If the titles need more
     height than the column leaves them, step them down: stats → smaller title → lede → eyebrow.
     Re-runs whenever the column, the index or the fonts change size, not just once. */
  const stageBox = $("#atlas"), titlesEl = $("#titles"), indexBox = $(".index"), leftCol = $("#leftcol");
  const titlesNeed = () => {
    let h = 0;
    for (const c of titlesEl.children) if (c.offsetParent) h = Math.max(h, c.offsetTop - titlesEl.offsetTop + c.offsetHeight);
    return h;
  };
  function fitLeft() {
    stageBox.classList.remove("fit-1", "fit-2", "fit-3", "fit-4");
    if (!narrow()) {
      for (let i = 1; i <= 4 && titlesNeed() > titlesEl.clientHeight + 1; i++) stageBox.classList.add("fit-" + i);
    }
  }
  addEventListener("resize", fitLeft);
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => fitLeft());
    [leftCol, indexBox, titlesEl.querySelector("h1")].forEach((el) => ro.observe(el));
  }
  if (document.fonts) { document.fonts.ready.then(fitLeft); document.fonts.addEventListener?.("loadingdone", fitLeft); }

  /* ---------- loader + viewer events ---------- */
  const loader = $("#loader");
  addEventListener("la:progress", (e) => {
    const p = Math.round(e.detail.p * 100);
    $("#loader-bar").style.width = p + "%"; $("#loader-pct").textContent = p + "%";
  });
  addEventListener("la:ready", (e) => {
    state.parts = e.detail.groups;
    loader.classList.add("done");
    document.body.classList.add("model-ready");
    frameStage();
    if (state.sel) { view().select(state.sel, LA.ex[state.ex].also); renderDrawer(); }
  });
  addEventListener("la:viewer", frameStage);
  addEventListener("la:error", () => { loader.classList.add("failed"); $("p", loader).textContent = T().noGl; });

  const tip = $("#tip");
  let hotBtn = null;
  addEventListener("la:hover", (e) => {
    const d = e.detail;
    if (hotBtn) { hotBtn.classList.remove("hot"); hotBtn = null; }
    if (!d || !LA.muscles[d.group]) { tip.hidden = true; return; }
    const m = LA.muscles[d.group];
    const part = state.lang === "zh" ? (LA.partZh[d.muscle] || L(m)) : LA.partEn(d.muscle);
    const sub = state.lang === "zh" ? LA.partEn(d.muscle) : (LA.partZh[d.muscle] || "");
    tip.innerHTML = `<b>${esc(part)}</b><small>${esc(sub)}</small><em>${esc(L(m))}</em>`;
    tip.style.left = d.x + "px"; tip.style.top = d.y + "px"; tip.hidden = false;
    hotBtn = $("#mb-" + d.group); if (hotBtn) hotBtn.classList.add("hot");
  });
  addEventListener("la:pick", (e) => { tip.hidden = true; if (e.detail) open(e.detail.group); });
  // the tooltip follows the 3D hover; drop it as soon as the pointer leaves the canvas or the page scrolls
  const hideTip = () => { tip.hidden = true; if (view()) view().hover(null); };
  $("#gl").addEventListener("pointerleave", hideTip);
  addEventListener("scroll", hideTip, { passive: true });

  /* ---------- HUD ---------- */
  $$("[data-face]").forEach((b) => b.addEventListener("click", () => view() && view().face(b.dataset.face)));
  $("#btn-in").addEventListener("click", () => view() && view().zoom(1));
  $("#btn-out").addEventListener("click", () => view() && view().zoom(-1));
  const autoBtn = $("#btn-auto");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) autoBtn.setAttribute("aria-pressed", "false");
  autoBtn.addEventListener("click", () => {
    const on = autoBtn.getAttribute("aria-pressed") !== "true";
    autoBtn.setAttribute("aria-pressed", String(on)); if (view()) view().setAuto(on);
  });

  /* ---------- muscle index ---------- */
  function renderIndex() {
    $("#index").innerHTML = LA.regions.map((r) => {
      const items = Object.entries(LA.muscles).filter(([, m]) => m.r === r.id).map(([id, m]) =>
        `<button type="button" class="mbtn${state.sel === id ? " on" : ""}" id="mb-${id}" data-id="${id}">${esc(L(m))}</button>`).join("");
      return `<div class="grp"><h3>${esc(L(r.s))}</h3><div>${items}</div></div>`;
    }).join("");
  }
  const indexEl = $("#index");
  indexEl.addEventListener("click", (e) => { const b = e.target.closest(".mbtn"); if (b) open(b.dataset.id); });
  indexEl.addEventListener("pointerover", (e) => { const b = e.target.closest(".mbtn"); if (b && view()) view().hover(b.dataset.id); });
  indexEl.addEventListener("pointerleave", () => view() && view().hover(null));

  /* ---------- selection + drawer ---------- */
  const drawer = $("#drawer"), scrim = $("#scrim"), din = $("#d-in");
  function markIndex() {
    $$(".mbtn.on").forEach((n) => n.classList.remove("on"));
    const b = state.sel && $("#mb-" + state.sel); if (b) b.classList.add("on");
  }
  function open(id, exKey) {
    const m = LA.muscles[id];
    if (!m) return;
    state.sel = id;
    state.ex = exKey && m.ex.includes(exKey) ? exKey : m.ex[0];
    renderDrawer(); markIndex();
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("open"));
    document.body.classList.add("drawer-open");
    if (narrow()) scrim.hidden = false;
    if (view()) view().select(id, LA.ex[state.ex].also);
    frameStage();
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  }
  function close() {
    theater(false);
    state.sel = null; state.ex = null;
    drawer.classList.remove("open");
    document.body.classList.remove("drawer-open");
    scrim.hidden = true;
    setTimeout(() => { if (!state.sel) { drawer.hidden = true; din.innerHTML = ""; } }, 520);
    markIndex();
    if (view()) view().select(null);
    frameStage();
    history.replaceState(null, "", location.pathname + location.search);
  }
  scrim.addEventListener("click", close);
  function theater(on) {
    document.body.classList.toggle("theater", on);
    const b = $("#vbig"), t = T();
    if (b) { b.setAttribute("aria-pressed", on); b.title = on ? t.shrink : t.enlarge; b.setAttribute("aria-label", b.title); b.lastChild.textContent = b.title; }
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.body.classList.contains("theater")) theater(false); else if (state.sel) close();
  });
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("theater") && !e.target.closest("#video")) theater(false);
  });

  const ICON = {
    x: '<svg viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"/></svg>',
    grow: '<svg class="i-grow" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5"/></svg>',
    shrink: '<svg class="i-shrink" viewBox="0 0 16 16" fill="none"><path d="M13 7H9V3M3 9h4v4M9 7l5-5M7 9l-5 5"/></svg>',
    yt: '<svg viewBox="0 0 24 24"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .6 12a31 31 0 0 0 .4 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.8 31 31 0 0 0-.4-4.8zM9.7 15.1V8.9l5.8 3.1z"/></svg>',
    bili: '<svg viewBox="0 0 24 24"><path d="M7.2 2.6l2.6 2.6h4.4l2.6-2.6 1.3 1.3-1.3 1.3H19a3 3 0 0 1 3 3v9.6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8.2a3 3 0 0 1 3-3h2.2L5.9 3.9zM5 7.2a1 1 0 0 0-1 1v9.6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8.2a1 1 0 0 0-1-1zm3 3.3l1.2.1v2.6l-1.2.1zm8 0l-1.2.1v2.6l1.2.1z"/></svg>'
  };

  function renderDrawer() {
    theater(false);
    const id = state.sel, m = LA.muscles[id], t = T();
    const region = LA.regions.find((r) => r.id === m.r);
    const ex = LA.ex[state.ex];
    const tabs = m.ex.map((k) =>
      `<button type="button" class="tab" role="tab" id="tab-${k}" data-k="${k}" aria-selected="${k === state.ex}">${esc(L(LA.ex[k].n))}</button>`).join("");
    const dots = [1, 2, 3].map((i) => `<i class="${i <= ex.lv ? "f" : ""}"></i>`).join("");
    const also = ex.also.filter((s) => s !== id).map((s) =>
      `<button type="button" class="chip sec" data-go="${s}">${esc(L(LA.muscles[s]))}</button>`).join("");
    // the real muscles that make up this group in the 3D model
    const seen = new Set();
    const parts = (state.parts[id] || []).map((n) => state.lang === "zh" ? (LA.partZh[n] || LA.partEn(n)) : LA.partEn(n))
      .filter((n) => !seen.has(n) && seen.add(n)).map((n) => `<li>${esc(n)}</li>`).join("");

    const zv = LA.zhVideo[state.ex];
    const zh = state.lang === "zh" && zv;
    const vid = zh
      ? { pic: zv.pic, ch: zv.ch, d: zv.d, src: "Bilibili", url: `https://www.bilibili.com/video/${zv.bv}`,
          embed: `https://player.bilibili.com/player.html?bvid=${zv.bv}&autoplay=1&danmaku=0&high_quality=1` }
      : { pic: `https://i.ytimg.com/vi/${ex.v}/hqdefault.jpg`, ch: ex.ch, d: ex.d, src: "YouTube", url: `https://www.youtube.com/watch?v=${ex.v}`,
          embed: `https://www.youtube-nocookie.com/embed/${ex.v}?autoplay=1&rel=0&modestbranding=1&playsinline=1` };

    din.innerHTML = `
      <div class="d-head">
        <div>
          <p class="eyebrow">${esc(L(region))}</p>
          <h2 id="d-title">${esc(L(m))}</h2>
          <p class="lat">${esc(state.lang === "zh" ? m.en + " · " : "")}${esc(m.lat)}</p>
        </div>
        <button type="button" class="x" id="d-close" aria-label="${t.close}">${ICON.x}</button>
      </div>
      <p class="desc">${esc(L(m.d))}</p>
      ${parts ? `<details class="parts"><summary>${t.muscles}</summary><ul>${parts}</ul></details>` : ""}
      <h3 class="d-h3">${t.exercises}</h3>
      <div class="tabs" role="tablist">${tabs}</div>
      <div class="video" id="video">
        <div class="vstage" id="vstage">
          <button type="button" class="poster" id="poster" aria-label="${t.play}: ${esc(L(ex.n))}">
            <img src="${vid.pic}" alt="" referrerpolicy="no-referrer">
            <span class="src ${zh ? "bili" : "yt"}">${vid.src}</span>
            <span class="pl">${ICON.play}</span>
            <span class="cap"><span>${esc(L(ex.n))}</span><span>${vid.d}</span></span>
          </button>
        </div>
        <button type="button" class="vbig" id="vbig" aria-pressed="false" title="${t.enlarge}" aria-label="${t.enlarge}">${ICON.grow}${ICON.shrink}<span>${t.enlarge}</span></button>
      </div>
      <p class="credit">${t.credit} ${esc(vid.ch)} · ${vid.src} · ${vid.d}</p>
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
        <a class="btn" href="${vid.url}" target="_blank" rel="noopener">${zh ? ICON.bili : ICON.yt}${zh ? t.openBili : t.openYt}</a>
        ${zh ? `<a class="btn ghost" href="https://www.youtube.com/watch?v=${ex.v}" target="_blank" rel="noopener">${ICON.yt}${t.altEn}</a>` : ""}
      </div>`;

    $("#d-close").addEventListener("click", close);
    $$(".tab", din).forEach((b) => b.addEventListener("click", () => {
      state.ex = b.dataset.k; renderDrawer(); if (view()) view().setSecondary(LA.ex[state.ex].also);
    }));
    $$("[data-go]", din).forEach((b) => b.addEventListener("click", () => open(b.dataset.go)));
    const play = () => {
      if (!$("#poster")) return;
      $("#vstage").innerHTML = `<iframe src="${vid.embed}" title="${esc(L(ex.n))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen scrolling="no" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    };
    $("#poster").addEventListener("click", play);
    // enlarge: the player grows in place into a centred cinema frame (no reparenting, so playback keeps going)
    $("#vbig").addEventListener("click", (e) => { e.stopPropagation(); theater(!document.body.classList.contains("theater")); play(); });
    din.scrollTop = 0;
  }

  /* ---------- language ---------- */
  function applyLang() {
    const t = T();
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
    $$("[data-t]").forEach((n) => { const v = t[n.dataset.t]; if (v != null) n.textContent = v; });
    $$(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
    renderIndex();
    if (state.sel) renderDrawer();
    fitLeft();
  }
  $$(".lang button").forEach((b) => b.addEventListener("click", () => {
    state.lang = b.dataset.lang; store.set("la-lang", state.lang); applyLang();
  }));
  applyLang();

  /* header gets a backdrop once the stage is scrolled away */
  const top = $(".top");
  const onScroll = () => top.classList.toggle("solid", scrollY > innerHeight * 0.7);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* deep link: #biceps opens that muscle */
  function fromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (LA.muscles[id] && id !== state.sel) open(id);
  }
  addEventListener("hashchange", fromHash);
  fromHash();
})();
