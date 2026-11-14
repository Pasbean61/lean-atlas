/* Lean Atlas — anatomy renderer.
   Every shape is drawn once for the image's left half (x < 150) and mirrored.
   Point lists are smoothed with a closed Catmull-Rom spline.
   The female figure is derived from the same anatomy with a proportional warp
   (narrower shoulders and waist, wider hips and thighs) plus a few overrides. */
window.LA = window.LA || {};

(function () {
  const CX = 150;
  const INFLATE = 1.07;
  const NS = "http://www.w3.org/2000/svg";

  /* ---------- silhouette (left half, top-centre → crotch) ---------- */
  const OUTLINE = [
    [150, 8], [134, 11], [123, 22], [119, 40], [119, 56], [122, 70], [127, 81], [133, 89],
    [134, 99], [132, 108], [118, 115], [98, 119], [82, 121],
    [70, 126], [61, 136], [56, 150], [53, 168], [49, 190], [46, 214], [45, 236],
    [42, 256], [38, 282], [37, 306], [39, 330], [37, 344], [33, 360], [32, 378], [36, 394], [43, 404],
    [50, 401], [53, 388], [53, 372], [56, 356], [57, 342],
    [60, 322], [65, 296], [70, 272], [74, 252], [77, 232], [81, 210], [86, 190], [92, 180],
    [95, 196], [97, 222], [101, 250], [103, 274], [101, 294], [95, 314], [91, 338],
    [91, 368], [95, 408], [101, 444], [103, 466], [102, 490], [104, 520], [108, 556], [111, 584],
    [108, 600], [101, 614], [104, 624], [124, 627], [138, 624], [139, 610], [136, 594],
    [136, 568], [140, 530], [142, 498], [139, 476], [140, 452], [144, 412], [147, 378], [150, 356]
  ];

  /* ---------- muscle shapes ----------
     m = muscle id, a = 1 when the shape belongs to the arm (warp handling) */
  const FRONT = [
    // traps seen from the front (slope neck → shoulder)
    { m: "upperTraps", p: [[134, 102], [131, 110], [116, 116], [100, 120], [112, 112], [126, 104]] },
    // deltoid: front + side heads
    { m: "sideDelt", p: [[78, 123], [67, 129], [60, 142], [58, 160], [62, 178], [67, 186], [69, 168], [71, 150], [76, 134]] },
    { m: "frontDelt", p: [[94, 122], [82, 124], [77, 136], [73, 156], [71, 176], [71, 190], [80, 180], [89, 162], [96, 144], [99, 130]] },
    // pectorals
    { m: "upperChest", fem: "uc", p: [[148, 124], [124, 122], [104, 125], [99, 132], [100, 146], [118, 150], [136, 152], [148, 152]] },
    { m: "midChest", p: [[148, 156], [132, 156], [114, 153], [99, 150], [94, 160], [95, 176], [104, 189], [120, 196], [138, 196], [148, 192]], fem: "chest" },
    // arm
    { m: "biceps", a: 1, p: [[80, 186], [72, 181], [63, 188], [57, 204], [55, 224], [58, 241], [64, 247], [70, 238], [75, 220], [79, 202]] },
    { m: "triceps", a: 1, p: [[86, 192], [83, 206], [79, 226], [76, 244], [79, 241], [83, 222], [86, 206]] },
    { m: "forearms", a: 1, p: [[57, 251], [47, 258], [41, 274], [39, 296], [42, 314], [46, 304], [51, 282], [58, 264]] },
    { m: "forearms", a: 1, p: [[71, 254], [61, 257], [55, 276], [50, 300], [46, 326], [53, 334], [58, 316], [63, 294], [69, 274], [72, 262]] },
    // core
    { m: "abs", fem: "a1", p: [[147, 199], [130, 199], [126, 207], [127, 219], [147, 220]] },
    { m: "abs", fem: "a2", p: [[147, 224], [128, 224], [126, 236], [128, 247], [147, 248]] },
    { m: "abs", fem: "a3", p: [[147, 252], [128, 252], [127, 264], [129, 275], [147, 276]] },
    { m: "abs", fem: "a4", p: [[147, 280], [129, 280], [130, 300], [135, 318], [142, 332], [147, 335]] },
    { m: "obliques", fem: "ob", p: [[121, 212], [106, 214], [102, 236], [104, 262], [106, 288], [114, 304], [124, 306], [126, 290], [124, 262], [123, 236]] },
    { m: "serratus", fem: "s1", p: [[98, 190], [109, 193], [117, 199], [106, 200], [99, 197]] },
    { m: "serratus", fem: "s2", p: [[99, 203], [111, 205], [119, 211], [107, 212], [100, 209]] },
    { m: "serratus", fem: "s3", p: [[100, 216], [111, 218], [119, 223], [108, 225], [101, 222]] },
    // hips & thighs
    { m: "gluteMed", p: [[100, 300], [94, 316], [93, 336], [97, 348], [102, 334], [106, 314]] },
    { m: "adductors", p: [[147, 354], [134, 348], [130, 366], [131, 392], [136, 404], [143, 388], [147, 370]] },
    { m: "quads", p: [[98, 334], [92, 360], [92, 396], [96, 428], [103, 452], [110, 460], [112, 436], [110, 398], [106, 362]] },
    { m: "quads", p: [[113, 334], [107, 360], [108, 398], [113, 432], [120, 452], [128, 446], [130, 412], [128, 372], [122, 344]] },
    { m: "quads", p: [[136, 398], [129, 414], [126, 438], [129, 458], [138, 460], [142, 442], [141, 418]] },
    // shins
    { m: "tibialis", p: [[114, 480], [109, 502], [109, 536], [113, 572], [119, 570], [121, 530], [121, 494]] },
    { m: "calves", p: [[130, 478], [136, 494], [140, 520], [138, 548], [132, 556], [127, 530], [126, 500]] },
    { m: "calves", p: [[106, 482], [102, 500], [103, 526], [105, 536], [107, 518], [107, 496]] }
  ];

  const BACK = [
    { m: "upperTraps", p: [[147, 98], [137, 100], [127, 110], [108, 118], [88, 123], [104, 128], [124, 130], [147, 134]] },
    { m: "midBack", p: [[147, 138], [126, 135], [107, 134], [116, 146], [127, 170], [137, 206], [147, 248]] },
    { m: "rotatorCuff", p: [[104, 140], [94, 146], [90, 162], [95, 178], [106, 184], [116, 178], [119, 164], [114, 150]] },
    { m: "rearDelt", p: [[87, 124], [74, 127], [66, 138], [65, 156], [70, 172], [77, 162], [86, 146], [96, 134]] },
    { m: "sideDelt", p: [[72, 126], [63, 134], [58, 150], [59, 168], [64, 178], [65, 158], [66, 140]] },
    { m: "lats", p: [[106, 188], [95, 190], [93, 202], [104, 198], [112, 192]] },
    { m: "lats", p: [[117, 186], [101, 192], [96, 206], [97, 232], [103, 258], [112, 278], [126, 286], [136, 276], [140, 254], [134, 222], [126, 198]] },
    { m: "lowerBack", p: [[147, 258], [142, 258], [137, 276], [134, 300], [136, 324], [143, 334], [147, 334]] },
    { m: "obliques", p: [[102, 262], [99, 282], [101, 300], [112, 304], [119, 294], [112, 280]] },
    // arm
    { m: "triceps", a: 1, p: [[64, 174], [56, 186], [51, 206], [51, 226], [56, 238], [61, 216], [66, 194]] },
    { m: "triceps", a: 1, p: [[82, 180], [72, 182], [67, 198], [64, 220], [64, 240], [70, 248], [77, 236], [81, 214], [85, 194]] },
    { m: "forearms", a: 1, p: [[57, 251], [47, 258], [41, 274], [39, 296], [42, 316], [47, 306], [52, 284], [58, 264]] },
    { m: "forearms", a: 1, p: [[71, 254], [61, 257], [55, 276], [50, 300], [46, 326], [53, 334], [58, 316], [63, 294], [69, 274], [72, 262]] },
    // hips & legs
    { m: "gluteMed", p: [[124, 300], [108, 300], [98, 308], [94, 322], [100, 330], [114, 318], [128, 310]] },
    { m: "glutes", p: [[146, 318], [130, 312], [113, 316], [99, 332], [96, 356], [103, 380], [121, 390], [139, 386], [147, 376]] },
    { m: "hamstrings", p: [[110, 394], [102, 412], [103, 440], [109, 460], [116, 450], [118, 422], [120, 398]] },
    { m: "hamstrings", p: [[127, 396], [123, 420], [123, 446], [128, 462], [136, 454], [140, 428], [139, 400]] },
    { m: "adductors", p: [[146, 388], [140, 394], [141, 418], [146, 430]] },
    { m: "calves", p: [[113, 476], [106, 496], [106, 522], [111, 542], [119, 530], [121, 502], [120, 482]] },
    { m: "calves", p: [[128, 478], [124, 502], [126, 532], [132, 550], [139, 532], [141, 502], [137, 482]] },
    { m: "calves", p: [[110, 548], [114, 568], [119, 584], [127, 584], [134, 566], [136, 550], [128, 556], [119, 554]] }
  ];

  /* female-only replacement shapes (pre-warp coordinates) */
  const FEM = {
    uc: [[147, 126], [126, 124], [108, 128], [102, 136], [108, 146], [126, 150], [147, 150]],
    chest: [[147, 156], [130, 152], [112, 152], [100, 160], [94, 178], [98, 198], [110, 212], [128, 216], [142, 210], [148, 198]],
    a1: [[147, 222], [131, 222], [128, 236], [130, 250], [147, 252]],
    a2: [[147, 256], [130, 256], [129, 272], [131, 286], [147, 288]],
    a3: [[147, 292], [132, 292], [134, 312], [141, 328], [147, 334]],
    a4: null,
    ob: [[121, 224], [106, 224], [102, 244], [104, 266], [106, 288], [114, 304], [124, 306], [126, 290], [124, 262], [123, 240]],
    s1: [[97, 206], [106, 208], [112, 212], [103, 214], [98, 211]],
    s2: [[98, 218], [108, 220], [113, 225], [104, 226], [99, 223]],
    s3: null
  };

  /* decorative anatomy lines (non-interactive) */
  const DETAIL = {
    front: [
      { d: [[148, 121], [128, 118], [108, 119], [96, 121]], w: 1 },           // clavicle
      { d: [[150, 198], [150, 336]], w: 0.8 },                                  // linea alba
      { d: [[121, 454], [114, 462], [114, 474], [121, 480], [129, 474], [129, 462], [121, 454]], w: 0.9 }, // patella
      { d: [[136, 99], [142, 118]], w: 0.8 }                                   // neck tendon
    ],
    back: [
      { d: [[150, 104], [150, 334]], w: 0.9 },                                  // spine
      { d: [[150, 388], [150, 360]], w: 0.9 },                                  // gluteal cleft
      { d: [[107, 466], [118, 470], [130, 467]], w: 0.8 },                      // knee crease
      { d: [[108, 136], [118, 140], [126, 136]], w: 0.8 }                       // scapular spine
    ]
  };

  /* ---------- geometry helpers ---------- */
  const lerpTable = (tbl, y) => {
    if (y <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (y <= tbl[i][0]) {
        const [y0, v0] = tbl[i - 1], [y1, v1] = tbl[i];
        const t = (y - y0) / (y1 - y0), s = t * t * (3 - 2 * t);
        return v0 + (v1 - v0) * s;
      }
    }
    return tbl[tbl.length - 1][1];
  };

  // female width profile (torso + legs scale around the centre line)
  const F_BODY = [[0, 0.93], [92, 0.92], [112, 0.86], [130, 0.85], [165, 0.87], [205, 0.89], [250, 0.87], [278, 0.86],
                  [305, 0.98], [332, 1.06], [372, 1.07], [420, 1.03], [470, 0.98], [560, 0.95], [640, 0.94]];
  // arm centre line (male) and how far the female arm sits from the centre
  const ARM_C = [[140, 70], [200, 66], [248, 60], [300, 51], [340, 46], [404, 43]];
  const F_ARM = [[140, 0.86], [200, 0.88], [250, 0.92], [330, 1.0], [404, 1.02]];
  const F_ARM_THICK = 0.84;

  function warpPt(p, sex, isArm) {
    if (sex === "m") return p;
    const [x, y] = p;
    if (isArm && y > 150) {
      const c = lerpTable(ARM_C, y);
      const cF = CX + (c - CX) * lerpTable(F_ARM, y);
      return [cF + (x - c) * F_ARM_THICK, y];
    }
    return [CX + (x - CX) * lerpTable(F_BODY, y), y];
  }

  // which outline points belong to the arm (shoulder tip → armpit)
  const ARM_FROM = 16, ARM_TO = 40;

  function catmull(pts, closed = true, k = 1 / 6) {
    const n = pts.length, f = (v) => Math.round(v * 10) / 10;
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[closed ? (i + 2) % n : Math.min(i + 2, n - 1)];
      const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
      const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
      d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
    }
    return closed ? d + "Z" : d;
  }
  const mirror = (pts) => pts.map(([x, y]) => [2 * CX - x, y]);

  function outlinePath(sex) {
    const half = OUTLINE.map((p, i) => warpPt(p, sex, i >= ARM_FROM && i <= ARM_TO));
    const other = mirror(half.slice(1, -1)).reverse();
    return catmull(half.concat(other));
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* head + hair: mannequin head, short crop for him, top-knot for her */
  function head(g, sex, view) {
    if (sex === "f") {
      // top knot
      el("ellipse", { cx: CX, cy: 6, rx: 15, ry: 11, class: "hair" }, g);
      const cap = view === "front"
        ? [[150, 10], [136, 13], [126, 22], [122, 36], [122, 50], [127, 44], [133, 30], [142, 25], [150, 24]]
        : [[150, 10], [136, 13], [126, 22], [122, 38], [122, 58], [126, 76], [136, 86], [150, 88]];
      el("path", { d: catmull(cap.concat(mirror(cap.slice(1, -1)).reverse())), class: "hair" }, g);
    } else {
      const cap = view === "front"
        ? [[150, 10], [135, 12], [125, 21], [121, 34], [123, 44], [128, 32], [138, 25], [150, 23]]
        : [[150, 10], [135, 12], [125, 21], [121, 36], [122, 54], [128, 66], [140, 72], [150, 73]];
      el("path", { d: catmull(cap.concat(mirror(cap.slice(1, -1)).reverse())), class: "hair" }, g);
    }
  }

  /* public: render one figure into an <svg> */
  LA.drawFigure = function (svg, sex, view) {
    svg.setAttribute("viewBox", "0 -12 300 652");
    svg.innerHTML = "";
    const root = el("g", { class: "fig" }, svg);
    el("ellipse", { cx: CX, cy: 628, rx: 72, ry: 7, class: "floor" }, root);
    el("path", { d: outlinePath(sex), class: "skin" }, root);
    head(root, sex, view);

    const details = el("g", { class: "detail" }, root);
    for (const ln of DETAIL[view]) {
      for (const side of [ln.d, mirror(ln.d)]) {
        if (ln.d.every(([x]) => x === CX) && side !== ln.d) continue;
        el("path", { d: catmull(side.map((p) => warpPt(p, sex, false)), false), "stroke-width": ln.w }, details);
      }
    }

    const muscles = el("g", { class: "muscles" }, root);
    const shapes = view === "front" ? FRONT : BACK;
    for (const s of shapes) {
      let pts = s.p;
      if (sex === "f" && s.fem) { pts = FEM[s.fem]; if (!pts) continue; }
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const base = pts.map(([x, y]) => warpPt([cx + (x - cx) * INFLATE, cy + (y - cy) * INFLATE], sex, !!s.a));
      for (const side of [base, mirror(base)]) {
        const g = el("g", { class: "m", "data-m": s.m }, muscles);
        const d = catmull(side);
        el("path", { d, class: "mb" }, g);
        el("path", { d, class: "ms" }, g);
      }
    }
    return svg;
  };

  /* which views a muscle is visible in */
  LA.viewsOf = function (id) {
    const v = [];
    if (FRONT.some((s) => s.m === id)) v.push("front");
    if (BACK.some((s) => s.m === id)) v.push("back");
    return v;
  };

  /* shared <defs>: shading + glow, referenced by every figure */
  LA.defs = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <defs>
      <radialGradient id="shade" cx="38%" cy="32%" r="78%">
        <stop offset="0" stop-color="#fff" stop-opacity=".34"/>
        <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#1a1640" stop-opacity=".30"/>
      </radialGradient>
      <linearGradient id="skinGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--skin-hi)"/>
        <stop offset="1" stop-color="var(--skin-lo)"/>
      </linearGradient>
      <radialGradient id="floorGrad">
        <stop offset="0" stop-color="var(--glow)" stop-opacity=".45"/>
        <stop offset="1" stop-color="var(--glow)" stop-opacity="0"/>
      </radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="b"/>
        <feFlood flood-color="#ff5a6e" flood-opacity=".85"/>
        <feComposite in2="b" operator="in" result="g"/>
        <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
  </svg>`;
})();
