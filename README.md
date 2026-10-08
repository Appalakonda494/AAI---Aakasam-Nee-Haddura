# AAI JE (Airport Operations) - Maths & Physics Mock Tests

A small web app to practise real AAI Junior Executive past-paper questions (Class XI/XII level Maths and Physics) like an online mock test.

- 348 questions (189 Maths, 159 Physics) in 35 chapters, from real AAI JE papers (2015-2023).
- Every question has a full step-by-step solution: Given, Concept, Formula used, Calculation, Good to know, Quick trick.

## What it does

- **Full mock test** - Maths, Physics or Mixed; pick the length, timer and negative marking.
- **Chapter-wise practice** - pick one or more chapters.
- **Tickable options** - click an option to tick it, click again (or "Clear response") to untick. Mark for review, question palette, keyboard shortcuts (`A`-`D` / `1`-`4` to answer, arrow keys to move).
- **Submit, then solutions** - solutions stay hidden during the test and open after you submit. You can reopen them any time from the attempt history.
- **Re-attempt mode** - re-attempt only the wrong and skipped questions of any attempt, retake the whole test, or practise your running **mistake bank** (questions whose latest result was wrong or skipped).
- **History and resume** - results, chapter-wise breakdown, and a test in progress survive a page refresh.

All progress is stored in your own browser (`localStorage`). Nothing is sent anywhere.

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
