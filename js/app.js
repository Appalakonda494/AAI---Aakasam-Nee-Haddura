/* AAI JE mock-test app. Plain JS, no build step, state kept in localStorage. */
(function () {
  'use strict';

  var DATA = window.AAI_DATA;
  var QUESTIONS = {};
  DATA.questions.forEach(function (q) { QUESTIONS[q.id] = q; });
  var CHAPTERS = {};
  DATA.chapters.forEach(function (c) { CHAPTERS[c.id] = c; });

  var KEY_ATTEMPTS = 'aai.attempts.v1';
  var KEY_CURRENT = 'aai.current.v1';
  var KEY_SETTINGS = 'aai.settings.v1';
  var LETTERS = ['A', 'B', 'C', 'D'];

  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal-root');
  var topExtra = document.getElementById('topbar-extra');

  var timerHandle = null;
  var view = { screen: 'home', i: 0, reviewFilter: 'all', attemptId: null };
  var current = null; // in-progress attempt

  /* ---------- storage ---------- */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }
  function attempts() { return load(KEY_ATTEMPTS, []); }
  function saveAttempts(list) { save(KEY_ATTEMPTS, list.slice(-100)); }
  function settings() {
    return Object.assign({ subject: 'Maths', count: 30, perQuestionMinutes: 1, negative: 0, shuffle: true }, load(KEY_SETTINGS, {}));
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function qStatus(attempt, qid) {
    var a = attempt.answers[qid];
    if (a === undefined || a === null) return 'skipped';
    return a === QUESTIONS[qid].correct ? 'correct' : 'wrong';
  }
  function scoreOf(attempt) {
    var neg = attempt.config.negative || 0;
    var correct = 0, wrong = 0, skipped = 0;
    attempt.qids.forEach(function (qid) {
      var s = qStatus(attempt, qid);
      if (s === 'correct') correct++;
      else if (s === 'wrong') wrong++;
      else skipped++;
    });
    return {
      correct: correct, wrong: wrong, skipped: skipped,
      score: Math.round((correct - wrong * neg) * 100) / 100,
      max: attempt.qids.length
    };
  }
  function latestStatuses() {
    var map = {};
    attempts().forEach(function (att) {
      att.qids.forEach(function (qid) { map[qid] = qStatus(att, qid); });
    });
    return map;
  }
  function mistakeIds() {
    var map = latestStatuses();
    return Object.keys(map).filter(function (qid) { return map[qid] !== 'correct' && QUESTIONS[qid]; });
  }
  function findAttempt(id) {
    return attempts().filter(function (a) { return a.id === id; })[0];
  }

  /* ---------- starting a test ---------- */
  function startTest(opts) {
    var qids = opts.qids;
    if (!qids.length) { alert('No questions match that selection.'); return; }
    if (opts.shuffle) qids = shuffled(qids);
    var minutes = opts.minutes || 0;
    current = {
      id: 'a' + Date.now(),
      title: opts.title,
      startedAt: Date.now(),
      endsAt: minutes ? Date.now() + minutes * 60000 : 0,
      config: {
        kind: opts.kind, minutes: minutes, negative: opts.negative || 0,
        reattemptOf: opts.reattemptOf || null
      },
      qids: qids,
      answers: {},
      marked: {},
      visited: {}
    };
    save(KEY_CURRENT, current);
    view = { screen: 'test', i: 0, reviewFilter: 'all', attemptId: null };
    render();
  }

  function startMock(form) {
    var subject = form.subject;
    var count = form.count;
    var pool = DATA.questions.filter(function (q) { return subject === 'Mixed' || q.subject === subject; }).map(function (q) { return q.id; });
    var qids;
    if (subject === 'Mixed') {
      var half = count ? Math.ceil(count / 2) : 0;
      var m = shuffled(pool.filter(function (id) { return QUESTIONS[id].subject === 'Maths'; }));
      var p = shuffled(pool.filter(function (id) { return QUESTIONS[id].subject === 'Physics'; }));
      qids = count ? m.slice(0, half).concat(p.slice(0, count - half)) : pool;
    } else {
      qids = count ? shuffled(pool).slice(0, count) : pool;
    }
    startTest({
      kind: 'mock', title: subject + ' mock (' + qids.length + ' Q)', qids: qids,
      minutes: form.perQuestionMinutes ? Math.ceil(qids.length * form.perQuestionMinutes) : 0,
      negative: form.negative, shuffle: true
    });
  }

  function startChapters(form) {
    var chosen = form.chapters;
    var qids = DATA.questions.filter(function (q) { return chosen.indexOf(q.chapter) !== -1; }).map(function (q) { return q.id; });
    var title = chosen.length === 1 ? CHAPTERS[chosen[0]].title : chosen.length + ' chapters practice';
    startTest({
      kind: 'chapter', title: title + ' (' + qids.length + ' Q)', qids: qids,
      minutes: form.perQuestionMinutes ? Math.ceil(qids.length * form.perQuestionMinutes) : 0,
      negative: form.negative, shuffle: form.shuffle
    });
  }

  function startReattempt(attempt, mode) {
    var qids = attempt.qids.filter(function (qid) {
      return mode === 'all' || qStatus(attempt, qid) !== 'correct';
    });
    var perQ = attempt.config.minutes ? attempt.config.minutes / attempt.qids.length : 0;
    startTest({
      kind: 'reattempt',
      title: (mode === 'all' ? 'Retake: ' : 'Re-attempt: ') + attempt.title,
      qids: qids, minutes: perQ ? Math.ceil(qids.length * perQ) : 0,
      negative: attempt.config.negative, shuffle: false,
      reattemptOf: attempt.id
    });
  }

  function startMistakeBank() {
    var ids = mistakeIds();
    var s = settings();
    startTest({
      kind: 'mistakes', title: 'My mistake bank (' + ids.length + ' Q)', qids: ids,
      minutes: s.perQuestionMinutes ? Math.ceil(ids.length * s.perQuestionMinutes) : 0,
      negative: s.negative, shuffle: true
    });
  }

  /* ---------- submit ---------- */
  function submitCurrent(auto) {
    if (!current) return;
    stopTimer();
    var finished = current;
    finished.submittedAt = Date.now();
    finished.timeSpent = Math.round((finished.submittedAt - finished.startedAt) / 1000);
    finished.autoSubmitted = !!auto;
    finished.result = scoreOf(finished);
    var list = attempts();
    list.push(finished);
    saveAttempts(list);
    localStorage.removeItem(KEY_CURRENT);
    current = null;
    modalRoot.innerHTML = '';
    view = { screen: 'result', i: 0, reviewFilter: 'all', attemptId: finished.id };
    render();
  }

  /* ---------- timer ---------- */
  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }
  function startTimer() {
    stopTimer();
    if (!current || !current.endsAt) return;
    timerHandle = setInterval(tick, 1000);
    tick();
  }
  function tick() {
    if (!current) return;
    var left = (current.endsAt - Date.now()) / 1000;
    var el = document.getElementById('timer');
    if (el) {
      el.textContent = fmtTime(left);
      el.className = 'timer' + (left < 60 ? ' low' : '');
    }
    if (left <= 0) submitCurrent(true);
  }

  /* ---------- rendering: home ---------- */
  function renderHome() {
    var s = settings();
    var subjectOpts = ['Maths', 'Physics', 'Mixed'].map(function (x) {
      return '<option' + (x === s.subject ? ' selected' : '') + '>' + x + '</option>';
    }).join('');
    var countOpts = [10, 20, 30, 50, 60, 0].map(function (n) {
      return '<option value="' + n + '"' + (n === s.count ? ' selected' : '') + '>' + (n ? n + ' questions' : 'All questions') + '</option>';
    }).join('');
    var timeOpts = [[0, 'No timer'], [0.5, '30 sec / question'], [1, '1 min / question'], [1.5, '1.5 min / question'], [2, '2 min / question']].map(function (t) {
      return '<option value="' + t[0] + '"' + (t[0] === s.perQuestionMinutes ? ' selected' : '') + '>' + t[1] + '</option>';
    }).join('');
    var negOpts = [[0, 'No negative marking'], [0.25, '-0.25 per wrong'], [0.33, '-0.33 per wrong'], [1, '-1 per wrong']].map(function (n) {
      return '<option value="' + n[0] + '"' + (n[0] === s.negative ? ' selected' : '') + '>' + n[1] + '</option>';
    }).join('');

    var chapterHtml = ['Maths', 'Physics'].map(function (sub) {
      var items = DATA.chapters.filter(function (c) { return c.subject === sub; }).map(function (c) {
        return '<label class="check"><input type="checkbox" name="chapter" value="' + c.id + '"> ' +
          esc(c.title) + ' <span class="muted small">(' + c.count + ')</span></label>';
      }).join('');
      return '<h3 style="margin-top:8px">' + sub + '</h3>' + items;
    }).join('');

    var mistakes = mistakeIds().length;
    var hist = attempts().slice().reverse();
    var histHtml = hist.length ? hist.slice(0, 15).map(function (a) {
      var r = a.result;
      var kindTag = a.config.kind === 'reattempt' ? '<span class="tag warn">re-attempt</span>' : '';
      return '<div class="history-item"><div><div>' + kindTag + '<b>' + esc(a.title) + '</b></div>' +
        '<div class="muted small">' + fmtDate(a.submittedAt) + ' &middot; score ' + r.score + '/' + r.max +
        ' &middot; ' + r.correct + ' right, ' + r.wrong + ' wrong, ' + r.skipped + ' skipped</div></div>' +
        '<div class="row">' +
        '<button data-action="open-result" data-arg="' + a.id + '">Result</button>' +
        '<button data-action="open-review" data-arg="' + a.id + '">Solutions</button>' +
        (r.wrong + r.skipped > 0 ? '<button data-action="reattempt" data-arg="' + a.id + '">Re-attempt</button>' : '') +
        '</div></div>';
    }).join('') : '<p class="muted">No attempts yet. Take a mock test to see your history here.</p>';

    var resume = '';
    if (current) {
      resume = '<div class="card" style="border-color:var(--warn)"><div class="row spread"><div><b>Test in progress:</b> ' +
        esc(current.title) + '<div class="muted small">Answered ' + Object.keys(current.answers).length + ' of ' + current.qids.length + '</div></div>' +
        '<div class="row"><button class="primary" data-action="resume">Resume</button>' +
        '<button data-action="discard">Discard</button></div></div></div>';
    }

    app.innerHTML = resume +
      '<div class="card"><h2>AAI JE (Airport Operations) - Maths &amp; Physics</h2>' +
      '<p class="muted">' + DATA.questions.length + ' real past-paper questions. Tick your answers, submit, then open the solutions. ' +
      'Wrong or skipped ones can be re-attempted any time.</p></div>' +
      '<div class="grid-2">' +
      '<div class="card"><h3>Full mock test</h3>' +
      '<form id="mock-form">' +
      '<label class="field">Subject<select name="subject">' + subjectOpts + '</select></label>' +
      '<label class="field">Length<select name="count">' + countOpts + '</select></label>' +
      '<label class="field">Timer<select name="time">' + timeOpts + '</select></label>' +
      '<label class="field">Marking<select name="neg">' + negOpts + '</select></label>' +
      '<button class="primary" type="submit">Start mock test</button></form></div>' +
      '<div class="card"><h3>Chapter-wise practice</h3>' +
      '<form id="chapter-form"><div class="chapter-list">' + chapterHtml + '</div>' +
      '<label class="check" style="margin-top:10px"><input type="checkbox" name="shuffle"' + (s.shuffle ? ' checked' : '') + '> Shuffle questions</label>' +
      '<p class="muted small">Uses the timer and marking chosen in the mock form.</p>' +
      '<button class="primary" type="submit">Start practice</button></form></div></div>' +
      '<div class="card"><div class="row spread"><div><h3>Mistake bank</h3>' +
      '<div class="muted small">Questions whose latest result was wrong or skipped: <b>' + mistakes + '</b></div></div>' +
      '<button class="primary" data-action="mistakes"' + (mistakes ? '' : ' disabled') + '>Practice my mistakes</button></div></div>' +
      '<div class="card"><div class="row spread"><h3>Attempt history</h3>' +
      (hist.length ? '<button class="ghost" data-action="clear-history">Clear history</button>' : '') + '</div>' + histHtml + '</div>';
  }

  /* ---------- rendering: test ---------- */
  function paletteClass(qid, i) {
    var cls = 'pbtn';
    var answered = current.answers[qid] !== undefined;
    var marked = current.marked[qid];
    if (marked) cls += ' marked';
    else if (answered) cls += ' answered';
    else if (current.visited[qid]) cls += ' skipped';
    if (i === view.i) cls += ' current';
    return cls;
  }

  function renderTest() {
    var qid = current.qids[view.i];
    var q = QUESTIONS[qid];
    current.visited[qid] = true;
    var chosen = current.answers[qid];
    var opts = q.options.map(function (o, idx) {
      var sel = chosen === idx ? ' selected' : '';
      return '<div class="option' + sel + '" data-action="choose" data-arg="' + idx + '">' +
        '<span class="box">' + LETTERS[idx] + '</span><span>' + o + '</span></div>';
    }).join('');
    var palette = current.qids.map(function (id, i) {
      return '<div class="' + paletteClass(id, i) + '" data-action="goto" data-arg="' + i + '">' + (i + 1) + '</div>';
    }).join('');
    var answeredCount = Object.keys(current.answers).length;
    var isLast = view.i === current.qids.length - 1;
    var tagSource = q.source ? '<span class="tag">' + esc(q.source) + '</span>' : '';

    topExtra.innerHTML = current.endsAt ? '<span class="timer" id="timer"></span>' : '<span class="muted small">No timer</span>';

    app.innerHTML = '<div class="test-layout"><div class="card">' +
      '<div class="qhead"><div><span class="tag">' + q.subject + '</span><span class="tag">' + esc(CHAPTERS[q.chapter].title) + '</span>' + tagSource + '</div>' +
      '<b>Q ' + (view.i + 1) + ' / ' + current.qids.length + '</b></div>' +
      '<div class="qtext">' + q.q + '</div>' + opts +
      '<div class="nav">' +
      '<button data-action="prev"' + (view.i === 0 ? ' disabled' : '') + '>Previous</button>' +
      '<button data-action="clear"' + (chosen === undefined ? ' disabled' : '') + '>Clear response</button>' +
      '<button data-action="mark">' + (current.marked[qid] ? 'Unmark review' : 'Mark for review') + '</button>' +
      '<button class="primary" data-action="next"' + (isLast ? ' disabled' : '') + '>Save &amp; next</button></div></div>' +
      '<div class="card"><h3>' + esc(current.title) + '</h3>' +
      '<div class="muted small" style="margin-bottom:8px">Answered ' + answeredCount + ' / ' + current.qids.length + '</div>' +
      '<div class="palette">' + palette + '</div>' +
      '<div class="legend"><span style="--c:var(--good)">Answered</span><span style="--c:var(--bad)">Not answered</span>' +
      '<span style="--c:var(--mark)">Marked</span><span style="--c:var(--line)">Not visited</span></div>' +
      '<div style="margin-top:14px"><button class="primary" data-action="submit" style="width:100%">Submit test</button></div></div></div>';
    save(KEY_CURRENT, current);
    if (current.endsAt) tick();
  }

  function confirmSubmit() {
    var total = current.qids.length;
    var answered = Object.keys(current.answers).length;
    var marked = Object.keys(current.marked).filter(function (k) { return current.marked[k]; }).length;
    modalRoot.innerHTML = '<div class="modal-back"><div class="modal"><h3>Submit test?</h3>' +
      '<p>Answered <b>' + answered + '</b> of ' + total + '. Not answered: <b>' + (total - answered) + '</b>. Marked for review: <b>' + marked + '</b>.</p>' +
      '<p class="muted small">Solutions open after you submit.</p>' +
      '<div class="row"><button class="primary" data-action="confirm-submit">Yes, submit</button>' +
      '<button data-action="cancel-modal">Keep working</button></div></div></div>';
  }

  /* ---------- rendering: result ---------- */
  function renderResult() {
    var a = findAttempt(view.attemptId);
    if (!a) { view.screen = 'home'; render(); return; }
    var r = a.result;
    var accuracy = r.correct + r.wrong ? Math.round(r.correct * 100 / (r.correct + r.wrong)) : 0;

    var byChapter = {};
    a.qids.forEach(function (qid) {
      var ch = QUESTIONS[qid].chapter;
      var row = byChapter[ch] || (byChapter[ch] = { c: 0, w: 0, s: 0 });
      var st = qStatus(a, qid);
      if (st === 'correct') row.c++; else if (st === 'wrong') row.w++; else row.s++;
    });
    var rows = Object.keys(byChapter).map(function (ch) {
      var row = byChapter[ch];
      return '<tr><td>' + esc(CHAPTERS[ch].title) + '</td><td class="num">' + row.c + '</td><td class="num">' + row.w +
        '</td><td class="num">' + row.s + '</td><td class="num">' + (row.c + row.w + row.s) + '</td></tr>';
    }).join('');

    var compare = '';
    if (a.config.reattemptOf) {
      var fixed = a.qids.filter(function (qid) { return qStatus(a, qid) === 'correct'; }).length;
      compare = '<p><span class="tag good">Re-attempt</span> You fixed <b>' + fixed + '</b> of the ' + a.qids.length +
        ' questions you missed last time.</p>';
    }
    var timeNote = a.autoSubmitted ? ' (auto-submitted when the timer ended)' : '';

    topExtra.innerHTML = '';
    app.innerHTML = '<div class="card"><h2>' + esc(a.title) + '</h2>' +
      '<div class="muted small" style="margin-bottom:12px">' + fmtDate(a.submittedAt) + ' &middot; time taken ' + fmtTime(a.timeSpent) + timeNote + '</div>' +
      compare +
      '<div class="score-grid">' +
      '<div class="stat"><b>' + r.score + ' / ' + r.max + '</b>Score</div>' +
      '<div class="stat"><b style="color:var(--good)">' + r.correct + '</b>Correct</div>' +
      '<div class="stat"><b style="color:var(--bad)">' + r.wrong + '</b>Wrong</div>' +
      '<div class="stat"><b style="color:var(--warn)">' + r.skipped + '</b>Skipped</div>' +
      '<div class="stat"><b>' + accuracy + '%</b>Accuracy</div></div>' +
      '<div class="row" style="margin-top:16px">' +
      '<button class="primary" data-action="open-review" data-arg="' + a.id + '">Open solutions</button>' +
      (r.wrong + r.skipped > 0 ? '<button data-action="reattempt" data-arg="' + a.id + '">Re-attempt wrong &amp; skipped (' + (r.wrong + r.skipped) + ')</button>' : '') +
      '<button data-action="retake" data-arg="' + a.id + '">Retake whole test</button>' +
      '<button data-action="home">Home</button></div></div>' +
      '<div class="card"><h3>Chapter-wise</h3><table class="tbl"><thead><tr><th>Chapter</th><th class="num">Right</th><th class="num">Wrong</th><th class="num">Skipped</th><th class="num">Total</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  /* ---------- rendering: review / solutions ---------- */
  function solutionHtml(q) {
    var parts = ['<div class="solution">'];
    if (q.given) parts.push('<h4>Given:</h4><div>' + q.given + '</div>');
    if (q.concept) parts.push('<h4>Concept:</h4><div>' + q.concept + '</div>');
    if (q.formula) parts.push('<h4>Formula used:</h4><div>' + q.formula + '</div>');
    if (q.steps.length) {
      parts.push('<h4>Calculation:</h4><ol>' + q.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>');
    }
    parts.push('<div class="hence">Hence, option ' + LETTERS[q.correct] + ' is correct.</div>');
    if (q.info) parts.push('<div class="box-info"><b>Good to know:</b> ' + q.info + '</div>');
    if (q.trick) parts.push('<div class="box-trick"><b>Quick trick:</b> ' + q.trick + '</div>');
    parts.push('</div>');
    return parts.join('');
  }

  function renderReview() {
    var a = findAttempt(view.attemptId);
    if (!a) { view.screen = 'home'; render(); return; }
    var filter = view.reviewFilter;
    var list = a.qids.filter(function (qid) {
      return filter === 'all' || qStatus(a, qid) === filter;
    });
    if (!list.length) { list = a.qids; filter = 'all'; view.reviewFilter = 'all'; }
    if (view.i >= list.length) view.i = 0;
    var qid = list[view.i];
    var q = QUESTIONS[qid];
    var st = qStatus(a, qid);
    var mine = a.answers[qid];

    var opts = q.options.map(function (o, idx) {
      var cls = 'option static';
      var note = '';
      if (idx === q.correct) { cls += ' correct'; note = ' <span class="tag good">correct</span>'; }
      else if (idx === mine) { cls += ' wrong'; note = ' <span class="tag bad">your answer</span>'; }
      if (idx === q.correct && idx === mine) note = ' <span class="tag good">correct &middot; your answer</span>';
      return '<div class="' + cls + '"><span class="box">' + LETTERS[idx] + '</span><span>' + o + note + '</span></div>';
    }).join('');

    var palette = list.map(function (id, i) {
      var s = qStatus(a, id);
      var cls = 'pbtn ' + (s === 'correct' ? 'right' : s === 'wrong' ? 'wrongq' : 'unatt') + (i === view.i ? ' current' : '');
      return '<div class="' + cls + '" data-action="goto" data-arg="' + i + '">' + (a.qids.indexOf(id) + 1) + '</div>';
    }).join('');

    var filters = [['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Skipped'], ['correct', 'Correct']].map(function (f) {
      return '<button class="' + (f[0] === filter ? 'primary' : '') + '" data-action="filter" data-arg="' + f[0] + '">' + f[1] + '</button>';
    }).join('');
    var stTag = st === 'correct' ? '<span class="tag good">Correct</span>' : st === 'wrong' ? '<span class="tag bad">Wrong</span>' : '<span class="tag warn">Skipped</span>';

    topExtra.innerHTML = '';
    app.innerHTML = '<div class="card"><div class="row spread"><h3 style="margin:0">Solutions: ' + esc(a.title) + '</h3>' +
      '<div class="row">' + filters + '<button data-action="open-result" data-arg="' + a.id + '">Back to result</button></div></div></div>' +
      '<div class="test-layout"><div class="card">' +
      '<div class="qhead"><div>' + stTag + '<span class="tag">' + q.subject + '</span><span class="tag">' + esc(CHAPTERS[q.chapter].title) + '</span>' +
      (q.source ? '<span class="tag">' + esc(q.source) + '</span>' : '') + '</div>' +
      '<b>Q ' + (a.qids.indexOf(qid) + 1) + '</b></div>' +
      '<div class="qtext">' + q.q + '</div>' + opts + solutionHtml(q) +
      '<div class="nav"><button data-action="prev"' + (view.i === 0 ? ' disabled' : '') + '>Previous</button>' +
      '<button class="primary" data-action="next"' + (view.i === list.length - 1 ? ' disabled' : '') + '>Next</button></div></div>' +
      '<div class="card"><h3>Questions (' + list.length + ')</h3><div class="palette">' + palette + '</div>' +
      '<div class="legend"><span style="--c:var(--good)">Correct</span><span style="--c:var(--bad)">Wrong</span><span style="--c:var(--warn)">Skipped</span></div>' +
      '<div style="margin-top:14px" class="row">' +
      (a.result.wrong + a.result.skipped > 0 ? '<button data-action="reattempt" data-arg="' + a.id + '">Re-attempt wrong &amp; skipped</button>' : '') +
      '</div></div></div>';
  }

  /* ---------- main render ---------- */
  function render() {
    window.scrollTo(0, 0);
    if (view.screen !== 'test') stopTimer();
    if (view.screen === 'home') { topExtra.innerHTML = ''; renderHome(); }
    else if (view.screen === 'test') { renderTest(); startTimer(); }
    else if (view.screen === 'result') renderResult();
    else if (view.screen === 'review') renderReview();
  }
  function rerenderKeepScroll() {
    var y = window.scrollY;
    if (view.screen === 'test') renderTest();
    else render();
    window.scrollTo(0, y);
  }

  /* ---------- events ---------- */
  function readSettingsFromForm() {
    var f = document.getElementById('mock-form');
    if (!f) return settings();
    var s = {
      subject: f.subject.value,
      count: parseInt(f.count.value, 10),
      perQuestionMinutes: parseFloat(f.time.value),
      negative: parseFloat(f.neg.value),
      shuffle: settings().shuffle
    };
    var cf = document.getElementById('chapter-form');
    if (cf) s.shuffle = cf.shuffle.checked;
    save(KEY_SETTINGS, s);
    return s;
  }

  function handleAction(action, arg) {
    var a;
    switch (action) {
      case 'choose':
        var qid = current.qids[view.i];
        var idx = parseInt(arg, 10);
        if (current.answers[qid] === idx) delete current.answers[qid];
        else current.answers[qid] = idx;
        rerenderKeepScroll();
        break;
      case 'clear':
        delete current.answers[current.qids[view.i]];
        rerenderKeepScroll();
        break;
      case 'mark':
        var mid = current.qids[view.i];
        if (current.marked[mid]) delete current.marked[mid]; else current.marked[mid] = true;
        rerenderKeepScroll();
        break;
      case 'next':
        view.i++;
        render();
        break;
      case 'prev':
        view.i--;
        render();
        break;
      case 'goto':
        view.i = parseInt(arg, 10);
        render();
        break;
      case 'submit': confirmSubmit(); break;
      case 'confirm-submit': submitCurrent(false); break;
      case 'cancel-modal': modalRoot.innerHTML = ''; break;
      case 'resume':
        view = { screen: 'test', i: 0, reviewFilter: 'all', attemptId: null };
        render();
        break;
      case 'discard':
        if (confirm('Discard the test in progress?')) {
          current = null;
          localStorage.removeItem(KEY_CURRENT);
          render();
        }
        break;
      case 'open-result':
        view = { screen: 'result', i: 0, reviewFilter: 'all', attemptId: arg };
        render();
        break;
      case 'open-review':
        view = { screen: 'review', i: 0, reviewFilter: 'all', attemptId: arg };
        render();
        break;
      case 'filter':
        view.reviewFilter = arg;
        view.i = 0;
        render();
        break;
      case 'reattempt':
        a = findAttempt(arg);
        if (a) startReattempt(a, 'missed');
        break;
      case 'retake':
        a = findAttempt(arg);
        if (a) startReattempt(a, 'all');
        break;
      case 'mistakes': startMistakeBank(); break;
      case 'clear-history':
        if (confirm('Delete all attempt history from this browser?')) {
          localStorage.removeItem(KEY_ATTEMPTS);
          render();
        }
        break;
      case 'home':
        view = { screen: 'home', i: 0, reviewFilter: 'all', attemptId: null };
        render();
        break;
      default: break;
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el) handleAction(el.getAttribute('data-action'), el.getAttribute('data-arg'));
  });

  document.getElementById('brand').addEventListener('click', function (e) {
    e.preventDefault();
    if (view.screen === 'test' && !confirm('Leave the test? Your progress is saved and you can resume from Home.')) return;
    handleAction('home');
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'mock-form') {
      var s = readSettingsFromForm();
      startMock(s);
    } else if (e.target.id === 'chapter-form') {
      var st = readSettingsFromForm();
      var chosen = Array.prototype.map.call(e.target.querySelectorAll('input[name=chapter]:checked'), function (c) { return c.value; });
      if (!chosen.length) { alert('Pick at least one chapter.'); return; }
      st.chapters = chosen;
      startChapters(st);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (view.screen !== 'test' || !current) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight' && view.i < current.qids.length - 1) handleAction('next');
    else if (e.key === 'ArrowLeft' && view.i > 0) handleAction('prev');
    else if (/^[1-4]$/.test(e.key) || /^[a-dA-D]$/.test(e.key)) {
      var n = /^[1-4]$/.test(e.key) ? parseInt(e.key, 10) - 1 : e.key.toLowerCase().charCodeAt(0) - 97;
      handleAction('choose', String(n));
    }
  });

  /* ---------- boot ---------- */
  current = load(KEY_CURRENT, null);
  if (current && current.endsAt && current.endsAt < Date.now()) {
    submitCurrent(true); // time ran out while the tab was closed
  } else {
    render();
  }
})();
