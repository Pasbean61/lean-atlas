# Lean Atlas · 薄肌图谱

A real-anatomy 3D muscle atlas floating in pure-black, star-lit space. The body turns on its own (or drag it); hover names each muscle, a click opens the lesson for that muscle group: embedded tutorial video (with an Enlarge cinema view), sets × reps, rest and form cues. Use the dial to browse muscle groups or highlight a training combination and open its lessons in order. 中文 mode plays Chinese lessons from Bilibili, EN mode plays English lessons from YouTube.

**▶ Live site: [pasbean61.github.io/lean-atlas](https://pasbean61.github.io/lean-atlas/?from=github)**

Plain HTML/CSS/JS, no build step. Serve the folder over http (the model and the video embeds need a real origin):

    python3 -m http.server 8810

- `assets/body.glb` – the 3D model (muscles grouped into 23 trainable groups, tendons, skeleton), Draco-compressed
- `js/viewer.js` – three.js stage: turntable, starfield, lighting, procedural muscle-fibre shader, picking, x-ray selection, post-processing
- `js/app.js` – page logic: drawer, language, deep links (`#biceps`)
- `js/data.js` – muscle groups, 51 exercises (English video ids), UI strings
- `js/videos-zh.js` – Chinese lesson per exercise (Bilibili)
- `js/names.js` – Chinese names of the individual muscles in the model

## Credits

The 3D model is derived from **Z-Anatomy** (CC BY-SA 4.0) and **BodyParts3D**, © The Database Center for Life Science (CC BY-SA 2.1 Japan); see `assets/ATTRIBUTION.md`. `assets/body.glb` is shared under CC BY-SA 4.0.
Lesson videos are embedded from YouTube and Bilibili; rights belong to their creators.
