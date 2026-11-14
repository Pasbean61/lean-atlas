# Lean Atlas · 薄肌图谱

Interactive gym muscle atlas. Tap any of 23 muscle groups on the male or female model (front and back) to open exercise lessons: embedded YouTube tutorial, sets × reps, rest, form cues. Chinese / English toggle.

Plain HTML/CSS/JS, no build step. Serve the folder over http (YouTube embeds need a real origin):

    python3 -m http.server 8810

- `js/anatomy.js` – figure renderer (point data → smoothed SVG; female form via proportional warp)
- `js/data.js` – muscles, 51 exercises with video ids, rules, weekly plan, UI strings
- `js/app.js` – interaction, drawer, language, deep links (`#biceps`)

Videos are embedded from YouTube; rights belong to their creators.
