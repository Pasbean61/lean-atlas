/* Lean Atlas — page logic (drawer, training combinations, language). The 3D stage lives in viewer.js. */
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
    sel: null, ex: null, mode: "muscles", region: "chest", muscle: null, combo: "chest", highlightRegion: true, parts: {}
  };
  const T = () => LA.t[state.lang];
  const L = (o) => (o ? o[state.lang] : "");
  const RX = (s) => state.lang === "zh" ? s : s.replace("/ 侧", "/ side").replace("力竭前 1–2 次", "1–2 shy of failure");
  const view = () => window.LAView;
  const narrow = () => matchMedia("(max-width: 860px)").matches;

  $("#stat-muscles").textContent = Object.keys(LA.muscles).length;
  $("#stat-videos").textContent = Object.keys(LA.ex).length + Object.keys(LA.zhVideo).length;

  const intro = $(".intro"), stage = $("#stage");
  const combos = $(".combos"), dial = $("#combo-dial"), exerciseList = $("#combo-exercises");
  const outerRing = $(".dial-outer", dial), innerRing = $(".dial-inner", dial);
  const reset = $(".combo-reset", dial);
  const exerciseGroups = Object.fromEntries(Object.entries(LA.muscles).flatMap(([group, muscle]) =>
    muscle.ex.map((exercise) => [exercise, group])));
  function renderRing(ring, entries, active) {
    const index = entries.findIndex(([key]) => key === active);
    ring.innerHTML = entries.map(([key, item], i) => {
      const name = L(item), label = L(LA.dialLabels[key] || item);
      return `<button type="button" data-dial-key="${key}" aria-label="${esc(name)}" title="${esc(name)}" aria-pressed="${i === index}" style="--angle:${i * 360 / entries.length}deg">${esc(label)}</button>`;
    }).join("");
    const marker = ring === outerRing ? $(".dial-marker-outer", dial) : $(".dial-marker-inner", dial);
    marker.hidden = index < 0;
    if (index < 0) return;
    const from = Number(marker.dataset.angle || 0), target = index * 360 / entries.length;
    const angle = target - 360 * Math.round((target - from) / 360);
    marker.dataset.angle = angle;
    marker.style.setProperty("--marker-angle", angle + "deg");
  }
  function renderDial() {
    const browse = state.mode === "muscles";
    const region = LA.dialRegions[state.region];
    const muscle = LA.muscles[state.muscle], combo = LA.combos[state.combo];
    const current = browse ? muscle || (state.highlightRegion ? region : null) : combo;
    const options = browse ? Object.entries(LA.dialRegions) : Object.entries(LA.combos);
    const exercises = browse ? muscle?.ex || (state.highlightRegion ? region.exercises : []) : combo?.exercises;

    $$("[data-mode]", combos).forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode)));
    outerRing.setAttribute("aria-labelledby", browse ? "dial-muscles" : "dial-combos");
    renderRing(outerRing, options, browse ? state.region : state.combo);
    renderRing(innerRing, browse ? region.groups.map((key) => [key, LA.muscles[key]]) : [], state.muscle);
    innerRing.hidden = !browse;
    $("#dial-selection").textContent = current ? L(current) : T().wholeBody;
    reset.hidden = !current;
    exerciseList.hidden = !exercises?.length;
    exerciseList.innerHTML = (exercises || []).map((key) => {
      const target = !muscle || !browse ? `<small>${esc(L(LA.muscles[exerciseGroups[key]]))}</small>` : "";
      return `<li><button type="button" data-exercise="${key}"><span>${esc(L(LA.ex[key].n))}</span>${target}</button></li>`;
    }).join("");
  }
  function highlightDial() {
    const viewer = view();
    if (!viewer) return;
    if (state.mode === "combos") {
      const combo = LA.combos[state.combo];
      viewer.setCombo(combo?.groups || []);
      if (!state.sel && combo) viewer.face(combo.face);
      return;
    }
    if (state.muscle) {
      viewer.setCombo([state.muscle], state.sel ? null : state.muscle);
    } else {
      const region = state.highlightRegion ? LA.dialRegions[state.region] : null;
      viewer.setCombo(region?.groups || []);
      if (!state.sel && region) viewer.face(region.face);
    }
  }
  function selectDial() {
    renderDial();
    highlightDial();
  }
  $(".dial-modes", combos).addEventListener("click", (event) => {
    const mode = event.target.dataset.mode;
    if (!mode || mode === state.mode) return;
    state.mode = mode;
    selectDial();
  });
  reset.addEventListener("click", () => {
    if (state.mode === "muscles") {
      state.muscle = null;
      state.highlightRegion = false;
    } else {
      state.combo = null;
    }
    selectDial();
    ($('[aria-pressed="true"]', outerRing) || $("button", outerRing)).focus({ preventScroll: true });
  });
  dial.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dial-key]");
    if (!button) return;
    const key = button.dataset.dialKey, ring = button.parentElement;
    const focused = document.activeElement === button;
    if (state.mode === "combos") {
      state.combo = key;
    } else if (ring === innerRing) {
      state.muscle = key;
    } else {
      state.region = key;
      state.muscle = null;
      state.highlightRegion = true;
    }
    selectDial();
    if (focused) $(`[data-dial-key="${key}"]`, ring).focus({ preventScroll: true });
  });
  dial.addEventListener("keydown", (event) => {
    const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!direction || !event.target.matches("[data-dial-key]")) return;
    event.preventDefault();
    const buttons = $$("button", event.target.parentElement);
    const next = buttons[(buttons.indexOf(event.target) + direction + buttons.length) % buttons.length];
    next.focus();
    next.click();
  });

  /* ---------- stage framing ---------- */
  function frameStage() {
    if (!view()) return;
    if (narrow()) { view().setShift(0, state.sel ? stage.clientHeight * 0.2 : 0); return; }
    const left = state.sel ? 0 : combos.offsetLeft + combos.offsetWidth;
    const right = state.sel ? drawer.offsetWidth :
      getComputedStyle(intro).position === "absolute" ? stage.clientWidth - intro.offsetLeft : 0;
    view().setShift((right - left) / 2, 0);
  }
  addEventListener("resize", frameStage);

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
    highlightDial();
    if (state.sel) { view().select(state.sel, LA.ex[state.ex].also); renderDrawer(); }
  });
  addEventListener("la:viewer", frameStage);
  addEventListener("la:error", () => { loader.classList.add("failed"); $("p", loader).textContent = T().noGl; });

  const tip = $("#tip");
  addEventListener("la:hover", (e) => {
    const d = e.detail;
    if (!d || !LA.muscles[d.group]) { tip.hidden = true; return; }
    const m = LA.muscles[d.group];
    const part = state.lang === "zh" ? (LA.partZh[d.muscle] || L(m)) : LA.partEn(d.muscle);
    const sub = state.lang === "zh" ? LA.partEn(d.muscle) : (LA.partZh[d.muscle] || "");
    tip.innerHTML = `<b>${esc(part)}</b><small>${esc(sub)}</small><em>${esc(L(m))}</em>`;
    tip.style.left = d.x + "px"; tip.style.top = d.y + "px"; tip.hidden = false;
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

  /* ---------- selection + drawer ---------- */
  const drawer = $("#drawer"), scrim = $("#scrim"), din = $("#d-in");
  let exerciseTrigger = null;
  exerciseList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-exercise]");
    if (!button) return;
    const key = button.dataset.exercise;
    exerciseTrigger = key;
    open(exerciseGroups[key], key);
  });
  function open(id, exKey) {
    const m = LA.muscles[id];
    if (!m) return;
    state.sel = id;
    state.ex = exKey && m.ex.includes(exKey) ? exKey : m.ex[0];
    drawer.hidden = false;
    renderDrawer();
    requestAnimationFrame(() => {
      if (!state.sel) return;
      drawer.classList.add("open");
      if (exerciseTrigger) $("#d-close").focus({ preventScroll: true });
    });
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
    const trigger = exerciseTrigger;
    exerciseTrigger = null;
    setTimeout(() => {
      if (state.sel) return;
      drawer.hidden = true;
      din.innerHTML = "";
      if (trigger) $(`[data-exercise="${trigger}"]`, exerciseList)?.focus({ preventScroll: true });
    }, 520);
    if (view()) view().select(null);
    highlightDial();
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
    renderDial();
    if (loader.classList.contains("failed")) $("p", loader).textContent = t.noGl;
    if (state.sel) renderDrawer();
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
