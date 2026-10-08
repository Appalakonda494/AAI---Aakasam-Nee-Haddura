# AAI JE (Airport Operations) - Maths & Physics Mock Tests

A small web app to practise real AAI Junior Executive past-paper questions (Class XI/XII level Maths and Physics) like an online mock test.

- 348 questions (189 Maths, 159 Physics) in 35 chapters, from real AAI JE papers (2015-2023).
- Every question has a full step-by-step solution: Given, Concept, Formula used, Calculation, Good to know, Quick trick.

## What it does

**Tests**
- **Full tests** - six fixed Full Mocks (Maths + Physics, ~57 questions each) that together cover the whole bank exactly once, plus six fixed Maths tests and six fixed Physics tests. Best, last score and attempt count are tracked so you can retake and compare.
- **Chapter tests** - one test per chapter (35 chapters), with your score and status (Not started / Weak / Improving / Strong).
- **Infinity practice** - endless questions one at a time. Check each answer immediately, open the solution if you want it, keep a streak, and stop whenever you like (the session is saved). Pick the subject, an optional chapter, and what comes first: smart mix, your weak ones, new ones, or random. When the bank runs out it starts a new round.
- **Custom** - random mock of any size, any set of chapters, your mistake bank, and your bookmarked questions.

**Taking a test**
- Tickable options (click again or "Clear" to untick), mark for review, question palette, keyboard shortcuts (`A`-`D` / `1`-`4`, arrow keys), optional timer and negative marking, submit confirmation.
- Solutions are hidden during the test. After you submit, open the review and click **Show solution** to see the correct answer and full working. Until then only your own answer is shown.

**Where you are failing, and where to focus**
- **My analysis** - accuracy, wrong vs skipped rate, average time per question, score trend, and a ranked **Focus here first** list. Priority combines how often a chapter appears in the papers with how badly it is going for you. It also flags slow chapters and gives tips (e.g. many wrong answers means concept gaps; many skipped means practise elimination).
- **Chapter page** - for each chapter: score, coverage, the concepts behind the questions you got wrong or skipped (most-missed first, with formula and quick trick), one-click practice on weak or new questions, study mode, and a per-question history.
- **Result screen** - chapter-wise breakdown with the weakest chapters linked to their focus pages.

**Re-attempt and revision**
- Re-attempt only the wrong and skipped questions of any attempt, or retake the whole test.
- Mistake bank (latest result wrong or skipped), bookmarks, and study mode (browse a chapter's solutions without being scored).

**Study depth**
- Solution order: Shortcut trick, Given, Concept, Formula, Calculation, answer, Good to know, then a collapsible **Additional info** block - the full note for the topic behind the question (definitions, every formula, why it works, cases, values, uses, common mistakes, exam patterns with practice questions).
- 119 topic notes cover all 348 questions. Each chapter page lists its topics ("Topic notes") with a full-page reader.
- Regenerate after editing `data/source/topics.json`: `python3 scripts/build_data.py`. New notes can be merged with `scripts/merge_topics.py`.

**Personal touches**
- Telugu title and motivation lines (score message on results, streak reactions, a nudge when the timer is low).
- A "Shabash beta" message when a question is answered correctly within the recommended time (the timer setting per question, or 60 s). The lines live in `data/shabash.js` - swap in your favourite film dialogues.
- Optional artwork in `assets/` (not committed): `icon.png`, `hero.jpg`, `title-dark.png`, `title-light.png`, `wm-face.jpg`, `wm-arms.jpg`, `wm-script.jpg`. Without them the site falls back to plain styling.

**Your data** stays in your browser (`localStorage`). Export and import a JSON backup from the analysis page to move it between devices.

## Run it

No build step and no server needed - just open `index.html` in a browser. Or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Updating the questions

The questions live as plain text in `data/source/bank_maths.json` and `bank_physics.json`. After editing them, regenerate the browser data file:

```bash
python3 scripts/build_data.py
```

This converts the plain notation (`x^2`, `sqrt(...)`, `theta`, `(a)/(b)`) to HTML (superscripts, symbols, stacked fractions) and writes `data/data.js`.

New questions can be appended to a chapter; existing question ids (`m3-5` = Maths chapter 3, question 5) stay stable so your history keeps matching.

## Notes

- Answer keys follow the papers. A few questions carry known paper typos; where the printed key does not match the maths, the solution says so.
- Personal study material. Past-paper content belongs to its respective owners.
