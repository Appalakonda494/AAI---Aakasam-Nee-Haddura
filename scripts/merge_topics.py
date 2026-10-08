"""Merge per-slice topic notes (out_*.json from the authoring step) into data/source/topics.json.

Usage: python3 scripts/merge_topics.py /path/to/dir_with_out_files
"""
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN = re.compile(r'[<>&\n]')


def main(src_dir):
    topics, links = [], {}
    for path in sorted(glob.glob(f'{src_dir}/out_*.json'), key=lambda p: int(re.search(r'out_(\d+)', p).group(1))):
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        topics.extend(data['topics'])
        for q in data['questions']:
            links[q['id']] = {'topic': q['topic'], 'link': q['link']}
    ids = {t['id'] for t in topics}
    missing = [qid for qid, v in links.items() if v['topic'] not in ids]
    bad = [t['id'] for t in topics if FORBIDDEN.search(json.dumps(t, ensure_ascii=False).replace('\\n', ''))]
    (ROOT / 'data' / 'source' / 'topics.json').write_text(
        json.dumps({'topics': topics, 'links': links}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(topics)} topics, {len(links)} question links; links to unknown topic: {len(missing)}; topics with forbidden chars: {bad}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/deep')
