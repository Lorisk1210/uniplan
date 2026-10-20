# Uniplan

A small, dependency-free web app for planning your uni semester in waves.

**Run it:** open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 4173   # then visit http://localhost:4173
```

Everything is stored in your browser's localStorage. Use *⋯ → Export backup* to keep a copy.

## Workflow

1. **Ideas**: brain-dump every course that sounds interesting (`N`, or *Save & add another*).
2. **Shortlist**: move the good ones forward with the `›` arrow on a card, or press `R` to
   **review the wave** one course at a time (`←` drop · `↓` keep · `→` advance · `Backspace` back).
3. **Final**: repeat until your final timetable has no red overlaps.

Each wave shows everything that got *at least* that far, so the timetable narrows as you go.
Dropped courses aren't deleted; restore them from the **Dropped** tab whenever you like.

## Features

- Week timetable with side-by-side layout and red highlighting for overlapping sessions
- **Option slots**: add several tutorial/exercise groups, tick *Option*, then click the one you want
  on the timetable. Options show whether they *fit* or *clash* before you pick one.
- Tags + tag filter, favorites, overlap-only filter, full-text search (name, code, room, notes…)
- Hide a course from the timetable temporarily (eye icon) to try out "what if" plans
- Hover a card to spotlight its sessions on the timetable (and the other way round)
- Credits, hours/week and overlap count per wave
- **Credit requirements**: give each course an *Area* (e.g. Theorie, Seminars, Studium Generale…) and the
  panel below the timetable totals credits per area and group against the min/max of your degree, listing which
  courses count where. It counts the current wave; courses not in Final yet show faded. The rules live in
  `PROGRAM` at the top of `app.js` (preset: M.Sc. Informatik, TU Darmstadt), so edit them there for another program.
- Undo for everything (`Ctrl/⌘ Z`), toast with *Undo* after destructive actions
- Export final wave to `.ics` (weekly, 15 weeks), print / save as PDF, JSON backup import/export
- Light / dark / auto theme

Shortcuts: `N` new course · `/` search · `R` review wave · `1`–`4` switch waves · `Ctrl/⌘ Z` undo
