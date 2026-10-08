"""Convert the plain-text question banks in data/source/ into data/data.js.

The banks store maths in a plain ASCII style (x^2, sqrt(...), theta, (a)/(b)).
This script turns every text field into small HTML (sup/sub, symbols, stacked
fractions) so the web app can render it directly. Run from the repo root:

    python3 scripts/build_data.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [('maths', 'Maths'), ('physics', 'Physics')]

_NCR_PAT = re.compile(r'\b(\d+)([CP])(\d+)\b')
_EXP_PAT = re.compile(r'\^(-?[A-Za-z0-9]+(?:\.[0-9]+)?)')
_SUB_PAT = re.compile(r'_(-?[A-Za-z0-9]+(?:\.[0-9]+)?)')
_SQRT_BARE_PAT = re.compile(r'\bsqrt(\d+)\b')
# a short variable name followed by 1-2 digits: E0, Z0, r1, q2, a23, eps0, mu0 -> subscript.
# (letters before it, digits before it or ^ _ . excluded, so sqrt2, ln2, cos45, 2x3 are left alone)
_VAR_SUB_PAT = re.compile(r'(?<![\^_>A-Za-z0-9.])(eps|mu|[A-Za-z])(\d{1,2})(?![\d\^_A-Za-z]|\.\d)')
_VAR_GREEK = {'eps': 'ε', 'mu': 'μ'}
_COEF_SUB_PAT = re.compile(r'\b([abc][xyz])(\d)\b')  # ax1, by1, cz1 -> ax<sub>1</sub>
_PAREN_FRAC_PAT = re.compile(r'\(([^()]+)\)/(\(([^()]+)\)|\d+\.\d+|[A-Za-z0-9]+)')
_FUNC_NAMES = {'sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'csc', 'log', 'ln',
               'exp', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'sqrt'}
_GREEK = [
    (r'\btheta\b', 'θ'), (r'\bpi\b', 'π'), (r'\blambda\b', 'λ'), (r'\bmu\b', 'μ'),
    (r'\balpha\b(?!\s+particles?\b)', 'α'),
    (r'\bbeta\b', 'β'),
    (r'\bgamma\b(?!\s+(?:rays?|decay)\b)', 'γ'),
    (r'\bomega\b', 'ω'),
    (r'\bphi\b', 'φ'), (r'\bepsilon\b', 'ε'), (r'\bsigma\b', 'σ'), (r'\bdelta\b', 'Δ'),
    (r'\brho\b', 'ρ'), (r'\beps\b', 'ε'),
]


def _escape(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

_NOTATION_RULES = [
    # numbers multiplied with x: 6x5, 4.0x10^2, 3x3 matrix, and "2 x 3", "(a) x (b)"
    (re.compile(r'(?<=\d)x(?=\d)'), '×'),
    (re.compile(r'(?<=[\d)]) x (?=[\d(])'), ' × '),
    (re.compile(r'(?<=[\d)])\s+x(?=\d)'), ' ×'),     # 5.3 x10^-4
    (re.compile(r'(?<=\d)x\s+(?=\d)'), '× '),        # 5.3x 10^-4
    (re.compile(r'(?<![A-Za-z0-9_^])x(?=10(?:\^|<su))'), '×'),     # 'needs x10^-4'
    # angles: 343 deg 38' 11" -> 343° 38′ 11″
    (re.compile(r'(\d)\s*deg\b'), r'\1°'),
    (re.compile(r"(°\s*\d+)'"), r'\1′'),
    (re.compile(r'(′\s*\d+)"'), r'\1″'),
    # intervals: -inf, inf, U between interval brackets
    (re.compile(r'\binf\b'), '∞'),
    (re.compile(r'([\])]) U ([\[(])'), r'\1 ∪ \2'),
    # units: microF -> μF, 20 ohm -> 20 Ω, 6.67 milliohm -> 6.67 mΩ, 1 angstrom -> 1 Å
    (re.compile(r'\bmicro([A-Z])'), r'μ\1'),
    (re.compile(r'(\d)\s*milliohms?\b'), r'\1 mΩ'),
    (re.compile(r'(\d)\s*ohms?\b'), r'\1 Ω'),
    (re.compile(r'([\d)])\s*angstroms?\b'), r'\1 Å'),
    (re.compile(r'(?<=\S) approx (?=\S)'), ' ≈ '),
    # sinx, cosA, tan7x, sin15A, logx -> sin x, cos A, tan 7x ...
    (re.compile(r'\b(sin|cosec|cos|tan|sec|cot|log|ln)([xyzABCD]|\d+[A-Za-z]?)(?![A-Za-z0-9])'), r'\1 \2'),
    # d-something names
    (re.compile(r'\bdPhi(\d?)'), lambda m: 'dΦ' + ('<SUB>' + m.group(1) + '</SUB>' if m.group(1) else '')),
    (re.compile(r'\bdI(\d)\b'), r'dI<SUB>\1</SUB>'),
    (re.compile(r'\bdtheta\b'), 'dθ'),
    (re.compile(r'\bPhi(\d?)\b'), lambda m: 'Φ' + ('<SUB>' + m.group(1) + '</SUB>' if m.group(1) else '')),
    (re.compile(r'\bdeltaP\b'), 'ΔP'),
    (re.compile(r'\bDelta(\d?)\b'), lambda m: 'Δ' + ('<SUB>' + m.group(1) + '</SUB>' if m.group(1) else '')),
    (re.compile(r'\bDeltaT\b'), 'ΔT'),
    (re.compile(r'\btau\b'), 'τ'), (re.compile(r'\bchi\b'), 'χ'), (re.compile(r'\bxi\b'), 'ξ'),
]


def apply_notation(s, sub='sub'):
    """Plain-text notation clean-up shared by the website and PDF exporters."""
    for pat, rep in _NOTATION_RULES:
        s = pat.sub(rep, s)
    return s.replace('<SUB>', '<' + sub + '>').replace('</SUB>', '</' + sub + '>')


def _group_scripts(s):
    """Turn ^(...) and _(...) (balanced, possibly nested) into sup/sub tags.
    Works from the last opener backwards so inner groups are done first."""
    while True:
        starts = [m.start() for m in re.finditer(r'[\^_]\(', s)]
        if not starts:
            return s
        i = starts[-1]
        depth = 0
        end = -1
        for j in range(i + 1, len(s)):
            if s[j] == '(':
                depth += 1
            elif s[j] == ')':
                depth -= 1
                if depth == 0:
                    end = j
                    break
        if end == -1:  # unbalanced: leave the marker alone and stop
            return s[:i] + s[i].replace('^', '&#94;').replace('_', '&#95;') + s[i + 1:]
        tag = 'sup' if s[i] == '^' else 'sub'
        s = s[:i] + f'<{tag}>' + s[i + 2:end] + f'</{tag}>' + s[end + 1:]


def math_html(s):
    """Escape and apply math notation to one text segment."""
    s = _escape(str(s))
    s = _group_scripts(s)
    s = _NCR_PAT.sub(lambda m: f'<sup>{m.group(1)}</sup>{m.group(2)}<sub>{m.group(3)}</sub>', s)
    s = _EXP_PAT.sub(lambda m: f'<sup>{m.group(1)}</sup>', s)
    s = _SUB_PAT.sub(lambda m: f'<sub>{m.group(1)}</sub>', s)
    s = s.replace('sqrt(', '√(')
    s = _SQRT_BARE_PAT.sub(lambda m: f'√{m.group(1)}', s)
    s = re.sub(r'\barc(sin|cos|tan|cot|sec|cosec)\b', r'\1<sup>-1</sup>', s)
    s = s.replace('+/-', '±').replace('infinity', '∞').replace('-&gt;', '→')
    s = apply_notation(s, 'sub')
    s = s.replace('*', '×')
    s = _COEF_SUB_PAT.sub(lambda m: f'{m.group(1)}<sub>{m.group(2)}</sub>', s)
    s = _VAR_SUB_PAT.sub(lambda m: f'{_VAR_GREEK.get(m.group(1), m.group(1))}<sub>{m.group(2)}</sub>', s)
    for pat, rep in _GREEK:
        s = re.sub(pat, rep, s)
    return s


def _split_fracs(text):
    """Split into ('text', str) / ('frac', num, den) segments, skipping matches
    that are really function calls, factor chains or truncated tokens."""
    segments = []
    pos = 0
    for m in _PAREN_FRAC_PAT.finditer(text):
        if m.start() > 0 and text[m.start() - 1].isalpha():
            continue
        if m.start() > 0 and text[m.start() - 1] in ')^':
            continue
        if m.end() < len(text) and text[m.end()] == '^':
            continue
        if m.group(3) is None:
            den_token = m.group(2)
            if den_token.lower() in _FUNC_NAMES:
                continue
            if m.end() < len(text) and text[m.end()] in '(^_':
                continue
            if len(den_token) >= 3 and den_token.isalpha():
                rest = text[m.end():m.end() + 2]
                if len(rest) == 2 and rest[0] == ' ' and rest[1].isalpha():
                    continue
        if m.start() > pos:
            segments.append(('text', text[pos:m.start()]))
        den = m.group(3) if m.group(3) is not None else m.group(2)
        segments.append(('frac', m.group(1), den))
        pos = m.end()
    if pos < len(text):
        segments.append(('text', text[pos:]))
    return segments


def to_html(s):
    if not s:
        return ''
    text = str(s).replace('<=', '≤').replace('>=', '≥')
    out = []
    for seg in _split_fracs(text):
        if seg[0] == 'text':
            out.append(math_html(seg[1]))
        else:
            out.append(f'<span class="frac"><span class="num">{math_html(seg[1])}</span>'
                       f'<span class="den">{math_html(seg[2])}</span></span>')
    return ''.join(out)


def chapter_title(heading):
    return re.sub(r'\s*\(\d+ questions?\)$', '', heading).strip()


def build():
    questions = []
    chapters = []
    for key, label in SOURCES:
        bank = json.loads((ROOT / 'data' / 'source' / f'bank_{key}.json').read_text(encoding='utf-8'))
        for ch_idx, section in enumerate(bank['sections'], 1):
            title = chapter_title(section['heading'])
            chapter_id = f'{key[0]}{ch_idx}'
            chapters.append({'id': chapter_id, 'subject': label, 'title': title,
                             'count': len(section['questions'])})
            for q_idx, item in enumerate(section['questions'], 1):
                questions.append({
                    'id': f'{chapter_id}-{q_idx}',
                    'subject': label,
                    'chapter': chapter_id,
                    'source': item.get('source', ''),
                    'q': to_html(item['q']),
                    'options': [to_html(o) for o in item['options']],
                    'correct': item['correct'],
                    'given': to_html(item.get('given', '')),
                    'concept': to_html(item.get('concept', '')),
                    'formula': to_html(item.get('formula', '')),
                    'steps': [to_html(c) for c in item.get('calculation', [])],
                    'info': to_html(item.get('info', '')),
                    'trick': to_html(item.get('trick', '')),
                })
    out = ROOT / 'data' / 'data.js'
    payload = {'chapters': chapters, 'questions': questions}
    out.write_text('window.AAI_DATA = ' + json.dumps(payload, ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'{len(questions)} questions, {len(chapters)} chapters -> {out.relative_to(ROOT)}')


if __name__ == '__main__':
    sys.exit(build())
