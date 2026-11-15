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
  const reset = $(".combo-reset", dial), dialModes = $(".dial-modes", combos);
  const lamps = { outer: $(".dial-index-outer", dial), inner: $(".dial-index-inner", dial) };
  const exerciseGroups = Object.fromEntries(Object.entries(LA.muscles).flatMap(([group, muscle]) =>
    muscle.ex.map((exercise) => [exercise, group])));
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- dial sound: synthesized, nothing downloaded ----------
     A detent = a short filtered noise snap + a faint metallic ping + a low body knock.
     Outer bezel sounds lower and heavier than the inner one. Audio starts on the first real gesture. */
  const sound = (() => {
    let ctx = null, out = null, noise = null, lastTick = 0, lastTooth = 0;
    let on = store.get("la-sound") !== "off";
    function init() {
      if (ctx || !on) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.001;
      out = ctx.createGain(); out.gain.value = 0.6;
      out.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const live = () => on && ctx && ctx.state === "running";
    function burst(t, { freq, q = 4, type = "bandpass", gain, dur, sweep, atk = 0.0015 }) {
      const src = ctx.createBufferSource(); src.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.2); src.stop(t + dur + 0.02);
    }
    function tone(t, { freq, gain, dur, type = "sine", drop = 1, atk = 0.002 }) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (drop !== 1) o.frequency.exponentialRampToValueAtTime(freq * drop, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
    // One crisp metal-on-metal click: a sub-millisecond high-passed snap plus a few inharmonic
    // partials that ring for a few tens of ms, like a steel pawl dropping into a knurled wheel.
    const PARTIALS = { outer: [3900, 5650, 7900], inner: [5100, 7350, 9800], latch: [3300, 4850, 6900] };
    function click(t, { set = "inner", gain = 1, ring = 1, pitch = 1 }) {
      const jit = pitch * (1 + (Math.random() - 0.5) * 0.04);
      burst(t, { freq: 4200 * jit, q: 0.7, type: "highpass", gain: 0.55 * gain, dur: 0.009, atk: 0.0004 });
      burst(t, { freq: 2300 * jit, q: 3, gain: 0.16 * gain, dur: 0.014, atk: 0.0004 });
      PARTIALS[set].forEach((f, i) => tone(t, { freq: f * jit, gain: (0.07 - i * 0.017) * gain * ring, dur: (0.05 - i * 0.012) * ring + 0.01, atk: 0.0005 }));
    }
    // bearing whir: a looped band of noise whose level follows how fast the bezel is turning
    let whir = null;
    function whirNode() {
      if (whir) return whir;
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.9;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp).connect(hp).connect(g).connect(out); src.start();
      return (whir = { g, bp });
    }
    return {
      get on() { return on; },
      unlock() { init(); if (ctx && ctx.state === "suspended") ctx.resume(); },
      set(v) { on = v; store.set("la-sound", v ? "on" : "off"); if (v) this.unlock(); else if (ctx) ctx.suspend(); },
      // one notch passing the index: the pawl lifts (faint) then snaps down; fast spins become a lighter ratchet
      tick(ring, speed = 0) {
        if (!live()) return;
        const now = performance.now();
        if (now - lastTick < 22) return;
        lastTick = now;
        const t = ctx.currentTime, outer = ring === "outer";
        const fast = Math.min(1, Math.abs(speed) / 900), soft = 1 - fast * 0.45;
        click(t, { set: outer ? "outer" : "inner", gain: 0.28 * soft, ring: 0.5 });
        click(t + 0.007, { set: outer ? "outer" : "inner", gain: (outer ? 0.95 : 0.8) * soft, ring: 1 - fast * 0.5 });
      },
      // the fine knurl between detents: tiny dry ticks that make it sound like a toothed wheel
      tooth(ring, speed = 0) {
        if (!live()) return;
        const now = performance.now();
        if (now - lastTick < 12 || now - lastTooth < 16) return;
        lastTooth = now;
        const fast = Math.min(1, Math.abs(speed) / 900);
        click(ctx.currentTime, { set: ring === "outer" ? "outer" : "inner", gain: 0.2 - fast * 0.06, ring: 0.35, pitch: 1.12 });
      },
      spin(level) {
        if (!live()) return;
        const w = whirNode(), t = ctx.currentTime, l = Math.min(1, level);
        w.g.gain.setTargetAtTime(l * l * 0.05, t, 0.04);
        w.bp.frequency.setTargetAtTime(1800 + l * 2600, t, 0.06);
      },
      // the bezel seats in its detent: a brighter, ringing snap
      settle(ring) {
        if (!live()) return;
        const t = ctx.currentTime, outer = ring === "outer";
        click(t, { set: outer ? "outer" : "inner", gain: 1.15, ring: 1.6, pitch: 1.04 });
        tone(t, { freq: outer ? 1250 : 1600, gain: 0.05, dur: 0.03, atk: 0.0005 });
      },
      // two-position slide switch: a short dry scrape, then a clean click-clack
      slide() {
        if (!live()) return;
        const t = ctx.currentTime;
        burst(t, { freq: 3000, q: 2, gain: 0.06, dur: 0.09, sweep: 6500 });
        click(t + 0.085, { set: "latch", gain: 0.9, ring: 1.1 });
        click(t + 0.105, { set: "inner", gain: 0.5, ring: 0.6, pitch: 1.1 });
      },
      // push button in the hub: click down, lighter click up
      press() {
        if (!live()) return;
        const t = ctx.currentTime;
        click(t, { set: "latch", gain: 0.85, ring: 0.8 });
        click(t + 0.075, { set: "inner", gain: 0.45, ring: 0.6, pitch: 1.15 });
      }
    };
  })();
  ["pointerdown", "keydown", "touchend"].forEach((type) => addEventListener(type, () => sound.unlock(), { passive: true }));

  /* ---------- the dial: two machined bezels on springs ----------
     Each ring rotates so the chosen item sits under its index at 12 o'clock. Labels counter-rotate to stay upright.
     rot/target are continuous degrees (never wrapped) so the bezel always takes the short way round. */
  const rings = {
    outer: { el: outerRing, keys: [], step: 0, index: -1, rot: 0, vel: 0, target: 0, aligned: -1, drag: null, pending: null },
    inner: { el: innerRing, keys: [], step: 0, index: -1, rot: 0, vel: 0, target: 0, aligned: -1, drag: null, pending: null }
  };
  const mod = (a, n) => ((a % n) + n) % n;
  const nearest = (goal, ref) => goal + 360 * Math.round((ref - goal) / 360);

  function renderRing(name, entries, active) {
    const r = rings[name], n = entries.length, step = n ? 360 / n : 0;
    r.keys = entries.map(([key]) => key); r.step = step; r.index = r.keys.indexOf(active);
    r.el.style.setProperty("--n", Math.max(n, 1));
    r.el.innerHTML = entries.map(([key, item], i) => {
      const name = L(item), label = L(LA.dialLabels[key] || item);
      return `<button type="button" data-dial-key="${key}" aria-label="${esc(name)}" title="${esc(name)}" aria-pressed="${i === r.index}" style="--angle:${i * step}deg"><i>${String(i + 1).padStart(2, "0")}</i><span>${esc(label)}</span></button>`;
    }).join("");
    // nothing chosen: park half a detent off so no label sits under the index
    const goal = r.index >= 0 ? -r.index * step : n > 1 ? -step / 2 : 0;
    r.target = nearest(goal, r.target);
    if (reducedMotion) { r.rot = r.target; r.vel = 0; }
    r.aligned = -1; detent(name, r, true);
    kick();
  }

  let raf = 0, lastT = 0, whirLevel = 0;
  const TOOTH = 7.5;   // knurl pitch in degrees: fine ticks between the labelled detents
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(0.032, (now - lastT) / 1000); lastT = now;
    let moving = false, spin = 0;
    for (const [name, r] of Object.entries(rings)) {
      if (!r.drag) {
        // heavy bezel: low stiffness, just under-damped, so it lands with a small settle
        const acc = 120 * (r.target - r.rot) - 18 * r.vel;
        r.vel += acc * dt; r.rot += r.vel * dt;
        if (Math.abs(r.target - r.rot) < 0.02 && Math.abs(r.vel) < 0.3) {
          if (r.travel > 0.5) sound.settle(name);   // it actually turned: seat it with a clunk
          r.rot = r.target; r.vel = 0; r.travel = 0;
        } else { moving = true; r.travel = (r.travel || 0) + Math.abs(r.vel * dt); }
      } else moving = true;
      r.el.style.setProperty("--rot", r.rot.toFixed(3) + "deg");
      // real angular speed this frame (works for drag and spring alike) drives the knurl ticks and the whir
      const rate = dt > 0 ? Math.abs(r.rot - (r.prev ?? r.rot)) / dt : 0; r.prev = r.rot;
      spin = Math.max(spin, rate / 650);
      detent(name, r);
      const tooth = Math.floor(r.rot / TOOTH);
      if (r.tooth !== undefined && tooth !== r.tooth && !reducedMotion) sound.tooth(name, rate);
      r.tooth = tooth;
    }
    whirLevel += (spin - whirLevel) * 0.35;
    sound.spin(moving ? whirLevel : 0);
    if (!moving) whirLevel = 0;
    raf = moving ? requestAnimationFrame(tick) : 0;
  }
  // which detent is under the index right now; pulse the lamp each time one clicks past
  function detent(name, r, quiet) {
    if (!r.keys.length) return;
    const a = mod(Math.round(-r.rot / r.step), r.keys.length);
    if (a === r.aligned) return;
    r.aligned = a;
    $$("[data-aligned]", r.el).forEach((b) => b.removeAttribute("data-aligned"));
    if (r.drag || r.index >= 0) r.el.children[a]?.setAttribute("data-aligned", "");
    if (quiet) return;
    sound.tick(name, r.vel);
    const lamp = lamps[name];
    lamp.classList.remove("tick"); void lamp.offsetWidth; lamp.classList.add("tick");
    if (r.drag) preview(name, r.keys[a]);
  }
  // while the bezel is being turned, light the body and the hub for whatever is under the index
  function preview(name, key) {
    const item = state.mode === "combos" ? (name === "outer" ? LA.combos[key] : LA.muscles[key])
      : name === "outer" ? LA.dialRegions[key] : LA.muscles[key];
    if (!item) return;
    $("#dial-selection").textContent = L(item);
    view()?.setCombo(item.groups || [key]);
  }

  function choose(name, key) {
    if (state.mode === "combos") {
      if (name === "inner") { open(key); return; }
      state.combo = key;
    } else if (name === "inner") {
      state.muscle = key;
    } else {
      state.region = key; state.muscle = null; state.highlightRegion = true;
    }
    selectDial();
  }
  function stepRing(name, dir) {
    const r = rings[name];
    if (!r.keys.length) return;
    const from = r.index >= 0 ? r.index : dir > 0 ? -1 : 0;
    choose(name, r.keys[mod(from + dir, r.keys.length)]);
  }

  function renderDial() {
    const browse = state.mode === "muscles", t = T();
    const region = LA.dialRegions[state.region];
    const muscle = LA.muscles[state.muscle], combo = LA.combos[state.combo];
    const regionOn = browse && (state.muscle || state.highlightRegion);
    const current = browse ? muscle || (regionOn ? region : null) : combo;
    const exercises = browse ? muscle?.ex || (regionOn ? region.exercises : []) : combo?.exercises || [];
    const groups = browse ? (muscle ? [state.muscle] : regionOn ? region.groups : []) : combo?.groups || [];

    dialModes.dataset.active = state.mode;
    $$("[data-mode]", combos).forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode)));
    outerRing.setAttribute("aria-labelledby", browse ? "dial-muscles" : "dial-combos");
    dial.dataset.mode = state.mode;
    renderRing("outer", Object.entries(browse ? LA.dialRegions : LA.combos), browse ? (regionOn ? state.region : null) : state.combo);
    const innerKeys = browse ? (regionOn ? region.groups : []) : combo?.groups || [];
    renderRing("inner", innerKeys.map((key) => [key, LA.muscles[key]]), browse ? state.muscle : null);

    $("#dial-selection").textContent = current ? L(current) : t.wholeBody;
    $("#dial-meta").textContent = current
      ? (groups.length > 1 ? `${groups.length} ${t.metaGroups} · ` : "") + `${exercises.length} ${t.metaMoves}`
      : `${Object.keys(LA.muscles).length} ${t.metaGroups}`;
    reset.hidden = !current;
    exerciseList.hidden = !exercises.length;
    exerciseList.innerHTML = exercises.map((key) => {
      const ex = LA.ex[key];
      const target = !muscle || !browse ? `<small>${esc(L(LA.muscles[exerciseGroups[key]]))}</small>` : "";
      return `<li><button type="button" data-exercise="${key}"><span class="nm"><span>${esc(L(ex.n))}</span>${target}</span><span class="rx">${esc(RX(ex.rx))}</span></button></li>`;
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
  dialModes.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-mode]")?.dataset.mode;
    if (!mode || mode === state.mode) return;
    state.mode = mode;
    sound.slide();
    selectDial();
  });
  reset.addEventListener("click", () => {
    sound.press();
    if (state.mode === "muscles") {
      state.muscle = null;
      state.highlightRegion = false;
    } else {
      state.combo = null;
    }
    selectDial();
  });

  /* sound on/off */
  const soundBtn = $("#dial-sound");
  function paintSound() { soundBtn.setAttribute("aria-pressed", String(sound.on)); soundBtn.lastChild.textContent = sound.on ? T().soundOn : T().soundOff; }
  soundBtn.addEventListener("click", () => { sound.set(!sound.on); paintSound(); if (sound.on) setTimeout(() => sound.press(), 30); });

  /* tap a label */
  dial.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dial-key]");
    if (!button) return;
    const name = button.parentElement === innerRing ? "inner" : "outer", key = button.dataset.dialKey;
    const focused = document.activeElement === button;
    choose(name, key);
    if (focused) $(`[data-dial-key="${key}"]`, rings[name].el)?.focus({ preventScroll: true });
  });
  /* arrow keys turn the ring that has focus */
  dial.addEventListener("keydown", (event) => {
    const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    const button = event.target.closest?.("[data-dial-key]");
    if (!dir || !button) return;
    event.preventDefault();
    const name = button.parentElement === innerRing ? "inner" : "outer";
    if (name === "inner" && state.mode === "combos") {
      const buttons = $$("button", innerRing);
      buttons[mod(buttons.indexOf(button) + dir, buttons.length)]?.focus();
      return;
    }
    stepRing(name, dir);
    const r = rings[name];
    r.el.children[r.index]?.focus({ preventScroll: true });
  });

  /* drag (mouse/pen: turn around the centre; touch: swipe sideways so vertical swipes still scroll the page) */
  let dragRing = null;
  function ringAt(e) {
    const box = dial.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const f = Math.hypot(e.clientX - cx, e.clientY - cy) / box.width;
    const name = f > 0.5 ? null : f >= 0.31 ? "outer" : f >= 0.165 ? "inner" : null;
    if (name === "inner" && (state.mode !== "muscles" || !rings.inner.keys.length)) return null;
    return name && { name, box, cx, cy };
  }
  dial.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const hit = ringAt(e);
    if (!hit) return;
    dragRing = hit.name;
    rings[hit.name].pending = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: hit.cx, cy: hit.cy, size: hit.box.width,
      a: Math.atan2(e.clientY - hit.cy, e.clientX - hit.cx), t: performance.now(), touch: e.pointerType === "touch" };
  });
  dial.addEventListener("pointermove", (e) => {
    const r = dragRing && rings[dragRing];
    const p = r && (r.drag || r.pending);
    if (!p || p.id !== e.pointerId) return;
    if (!r.drag) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      if (p.touch && Math.abs(e.clientY - p.y) > Math.abs(e.clientX - p.x)) { r.pending = null; dragRing = null; return; }
      r.drag = p; r.pending = null; r.vel = 0;
      try { dial.setPointerCapture(e.pointerId); } catch (err) {}
      dial.classList.add("dragging");
    }
    const d = r.drag, now = performance.now();
    let delta;
    if (d.touch) { delta = (e.clientX - d.x) * 360 / (Math.PI * d.size * 0.72); d.x = e.clientX; }
    else {
      const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      delta = (a - d.a) * 180 / Math.PI; d.a = a;
      if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
    }
    r.rot += delta;
    const dt = Math.max(0.008, (now - d.t) / 1000); d.t = now;
    r.vel = r.vel * 0.55 + (delta / dt) * 0.45;
    kick();
  });
  function endDrag(e) {
    const name = dragRing, r = name && rings[name];
    if (!r) return;
    dragRing = null; r.pending = null;
    if (!r.drag || r.drag.id !== e.pointerId) return;
    const held = performance.now() - r.drag.t > 90;   // paused before letting go: no fling
    r.drag = null; r.travel = 1; dial.classList.remove("dragging");   // always seat a released bezel audibly
    // a flick carries the bezel on a little; then it settles on the nearest detent
    const projected = r.rot + (held ? 0 : Math.max(-600, Math.min(600, r.vel)) * 0.09);
    const idx = Math.round(-projected / r.step);
    r.target = -idx * r.step;
    choose(name, r.keys[mod(idx, r.keys.length)]);
  }
  dial.addEventListener("pointerup", endDrag);
  dial.addEventListener("pointercancel", endDrag);

  /* scroll wheel / trackpad: one detent per notch */
  let wheelAcc = 0, wheelAt = 0;
  dial.addEventListener("wheel", (e) => {
    if (narrow()) return;
    const hit = ringAt(e);
    if (!hit) return;
    e.preventDefault();
    const now = performance.now();
    wheelAcc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(wheelAcc) < 36 || now - wheelAt < 140) return;
    stepRing(hit.name, Math.sign(wheelAcc));
    wheelAcc = 0; wheelAt = now;
  }, { passive: false });

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
    paintSound();
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
