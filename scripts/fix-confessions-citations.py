"""Repair inspected citation typos in Moreau's Confessions; never contacts the CMS.

Usage: python scripts/fix-confessions-citations.py original.epub corrected.epub
Original archive members, IDs and markup are preserved except for the exact
broken list/paragraph boundary documented below. No parenthesis content is cut.
"""
import json
import re
import sys
import zipfile
from collections import Counter
from xml.etree import ElementTree as ET


def repair(source, output):
    counts = Counter()
    # Only the opening whitespace of identified biblical references is removed.
    names = r'1 Jean|Act|Actes|Apoc|Coloss|Dan|Eccli|Ecclési|Eph|Ephés|Exod|Galat|Gen|I Cor|I Pier|I Pierre|I Thess|I Tim|I\. Cor|II Cor|II Rois|II Tim|III Rois|Is|Isaïe|Jacq|Jean|Job|Jérém|Luc|Math|Matth|PS|Philip|Prov|Ps|Rom|Sag|Sagesse|Tim|Tob'
    opening = re.compile(r'\( +(?=(?:' + names + r')\b\.?\s*,?\s*[IVXLCDM0-9])')
    exact = {
        '((Ps. XXIV, 9,18)': '(Ps. XXIV, 9,18)',
        'Dieu( (Ps. LXXII, 20)': 'Dieu (Ps. LXXII, 20)',
        '(Exod. XXXII,</li>\n</ol><p>1-6; Ps. CV, 19, 20.)!</p>':
            '(Exod. XXXII, 1-6; Ps. CV, 19, 20.)!</li>\n</ol>',
        '(Exod. XXXII,</li>\n\n        </ol>\n\n        <p>1-6; Ps. CV, 19, 20.)!</p>':
            '(Exod. XXXII, 1-6; Ps. CV, 19, 20.)!</li>\n\n        </ol>',
    }
    entries = []
    with zipfile.ZipFile(source) as before:
        for entry in before.infolist():
            data = before.read(entry.filename)
            if entry.filename.endswith('.xhtml') and '/literae-notes/' not in entry.filename:
                original = data.decode('utf-8')
                text = original
                for old, new in exact.items():
                    count = text.count(old)
                    counts[old] += count
                    text = text.replace(old, new)
                text, count = opening.subn('(', text)
                counts['opening_spaces'] += count
                # All words and punctuation other than the two proven duplicate
                # parentheses must survive, in exactly the same reading order.
                old_text = ''.join(ET.fromstring(original).itertext())
                new_text = ''.join(ET.fromstring(text).itertext())
                normalize = lambda value: re.sub(r'\s+', '', value).replace('(', '')
                assert normalize(old_text) == normalize(new_text), entry.filename
                assert old_text.count('(') - new_text.count('(') == original.count('((Ps. XXIV, 9,18)') + original.count('Dieu( (Ps. LXXII, 20)')
                data = text.encode('utf-8')
            entries.append((entry, data))
    keys = list(exact)
    assert counts[keys[0]] == counts[keys[1]] == 1, dict(counts)
    assert sum(counts[key] for key in keys[2:]) == 1, dict(counts)
    with zipfile.ZipFile(output, 'w') as after:
        for entry, data in entries:
            after.writestr(entry, data)
    print(json.dumps(dict(counts), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    repair(*sys.argv[1:])
