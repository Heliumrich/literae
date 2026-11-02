#!/usr/bin/env python3
"""Restore reader defaults and style only notes in a downloadable EPUB, preserving text and links."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from lxml import etree as E

X = 'http://www.w3.org/1999/xhtml'
EP = 'http://www.idpf.org/2007/ops'
NS = {'x': X, 'epub': EP}
CSS = '''
/* Compact downloadable edition */
aside.ebook-note { margin: 0; padding: 0; font-size: .8em; line-height: 1.2; }
aside.ebook-note p { margin: 0; padding: 0; text-indent: 0; }
sup.ebook-noteref { line-height: 0; }
'''


def add_class(node, name):
    node.set('class', ' '.join(dict.fromkeys((node.get('class', '') + ' ' + name).split())))


def space_before(marker):
    """Use one no-break space before the call, even after an empty anchor or emphasis."""
    previous_text = marker.xpath('preceding::text()[1]')
    block = next((p for p in marker.iterancestors() if p.tag in {f'{{{X}}}p', f'{{{X}}}li'}), None)
    if not previous_text or block is None:
        return
    slot = previous_text[0]
    owner = slot.getparent()
    if owner is not block and block not in owner.iterancestors():
        return  # A call at the start of a paragraph needs no leading space.
    if slot.is_tail:
        owner.tail = str(slot).rstrip()
    else:
        owner.text = str(slot).rstrip()
    previous = marker.getprevious()
    if previous is None:
        marker.getparent().text = (marker.getparent().text or '').rstrip() + '\u00a0'
    else:
        previous.tail = (previous.tail or '').rstrip() + '\u00a0'


def compact(source, target, stylesheet):
    assert source.resolve() != target.resolve()
    with ZipFile(source) as z:
        files = {n: z.read(n) for n in z.namelist()}
    assert stylesheet in files, 'The specified stylesheet is missing'
    # Reader defaults: no generic body, paragraph, heading or image rules.
    files[stylesheet] = CSS.lstrip().encode()
    changed = [stylesheet]
    counts = {'notes': 0, 'calls': 0}
    for name in list(files):
        if not name.endswith(('.xhtml', '.html')):
            continue
        original = E.fromstring(files[name])
        root = E.fromstring(files[name])
        # Graphic cover pages keep their dedicated layout, outside the reading text.
        if root.xpath('//x:meta[@name="calibre:cover" and @content="true"] | //*[@class="literae-cover"]', namespaces=NS):
            continue
        styles = root.xpath('//x:style', namespaces=NS)
        styled_nodes = root.xpath('//*[@style]')
        for style in styles:
            style.getparent().remove(style)
        for node in styled_nodes:
            del node.attrib['style']
        notes = root.xpath('//x:aside[@epub:type="footnote" or @role="doc-footnote"]', namespaces=NS)
        calls = root.xpath('//x:a[@epub:type="noteref" or @role="doc-noteref"]', namespaces=NS)
        if not notes and not calls and not styles and not styled_nodes:
            continue
        for note in notes:
            add_class(note, 'ebook-note')
        for call in calls:
            assert call.get('href'), 'A note call must retain a destination'
            marker = call.getparent()
            if marker.tag != f'{{{X}}}sup':
                marker = E.Element(f'{{{X}}}sup')
                marker.tail, call.tail = call.tail, None
                call.getparent().replace(call, marker)
                marker.append(call)
            add_class(marker, 'ebook-noteref')
            space_before(marker)
        # Changes are limited to presentation and whitespace around note calls.
        normalize = lambda r: re.sub(r'\s+', '', ''.join(r.find('x:body', NS).itertext()))
        assert normalize(original) == normalize(root), f'Text changed: {name}'
        assert original.xpath('//@id') == root.xpath('//@id'), f'Anchor changed: {name}'
        assert original.xpath('//@href') == root.xpath('//@href'), f'Link changed: {name}'
        assert len(original.xpath('//x:p', namespaces=NS)) == len(root.xpath('//x:p', namespaces=NS))
        files[name] = E.tostring(root, encoding='utf-8', xml_declaration=True)
        changed.append(name)
        counts['notes'] += len(notes)
        counts['calls'] += len(calls)
    assert counts['notes'] and counts['calls'], 'No inline notes found; inspect this edition first'
    package = E.fromstring(files['META-INF/container.xml']).find('.//{*}rootfile').get('full-path')
    opf = E.fromstring(files[package])
    opf.find('.//{*}meta[@property="dcterms:modified"]').text = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    files[package] = E.tostring(opf, encoding='utf-8', xml_declaration=True)
    changed.append(package)
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('mimetype', files.pop('mimetype'), compress_type=ZIP_STORED)
        for name, data in files.items():
            z.writestr(name, data)
    return {**counts, 'changed_members': changed}


if __name__ == '__main__':
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    parser.add_argument('--stylesheet', required=True)
    args = parser.parse_args()
    print(json.dumps(compact(args.source, args.target, args.stylesheet), ensure_ascii=False, indent=2))
