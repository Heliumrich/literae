#!/usr/bin/env python3
"""Repackage supplied Pandoc patristic EPUBs. Requires lxml; never uploads to CMS.

python scripts/prepare-patristic-epubs.py CATALOG.json INPUT_DIR OUTPUT_DIR
The catalogue supplies title, author, translator, year, edition and source citations.
Use EPUBCheck on every result before publication; see docs/PATRISTIC-EPUBS.md.
"""
from __future__ import annotations

import copy
import hashlib
import json
import posixpath
import re
import sys
import textwrap
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

from lxml import etree as ET

XHTML = 'http://www.w3.org/1999/xhtml'
EPUB = 'http://www.idpf.org/2007/ops'
OPF = 'http://www.idpf.org/2007/opf'
DC = 'http://purl.org/dc/elements/1.1/'
SVG = 'http://www.w3.org/2000/svg'
NS = {'x': XHTML, 'o': OPF}
MAX_BYTES = 250_000
CHUNK_BYTES = 170_000  # Leave room for headers and longer rewritten links.
CSS = '''html { -webkit-text-size-adjust: 100%; }
body { margin: 1.5em; line-height: 1.6; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; font-family: serif; }
h1 { font-size: 1.8em; } h2 { font-size: 1.4em; } h3 { font-size: 1.15em; }
p { margin: .7em 0; } sup { line-height: 0; }
.footnotes { font-size: .9em; } a { overflow-wrap: anywhere; }
nav ol { list-style: decimal; } nav ol ol { margin-left: 1em; }
'''


def tag(e):
    return ET.QName(e).localname if isinstance(e.tag, str) else ''


def text(e):
    return ' '.join(' '.join(e.itertext()).split())


def element(tag_name, parent=None, value=None, **attrs):
    e = ET.Element(f'{{{XHTML}}}{tag_name}', **attrs)
    if value is not None:
        e.text = value
    if parent is not None:
        parent.append(e)
    return e


def document(title):
    root = ET.Element(f'{{{XHTML}}}html', nsmap={None: XHTML, 'epub': EPUB}, lang='fr')
    root.set('{http://www.w3.org/XML/1998/namespace}lang', 'fr')
    head = element('head', root)
    element('meta', head, charset='utf-8')
    element('title', head, title)
    element('link', head, rel='stylesheet', href='style.css')
    return root, element('body', root)


def xml(root):
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def label(e):
    # Noterefs are not part of a heading's label.
    cloned = copy.deepcopy(e)
    for a in cloned.xpath('.//*[@epub:type="noteref"]', namespaces={'epub': EPUB}):
        a.getparent().remove(a)
    value = text(cloned).rstrip(' .')
    if re.fullmatch(r'\d+\.?', value):
        return 'Article ' + value.rstrip('.')
    for word, replacement in [('HOMÉLIE', 'Homélie'), ('HOMELIE', 'Homélie'), ('CHAPITRE', 'Chapitre'), ('LIVRE', 'Livre')]:
        if value.startswith(word + ' '):
            return replacement + value[len(word):]
    return value


def flatten(parent):
    """Remove structural wrappers, retaining mixed inline text and every ID."""
    if parent.text and parent.text.strip():
        yield element('p', value=parent.text)
    block_tags = {'section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ol', 'ul', 'table', 'blockquote'}
    for child in list(parent):
        structural = tag(child) == 'section' or tag(child) == 'div' and any(tag(c) in block_tags for c in child)
        if structural:
            if child.get('id'):
                yield element('span', id=child.get('id'))
            yield from flatten(child)
        else:
            cloned = copy.deepcopy(child)
            cloned.tail = None
            yield cloned
        if child.tail and child.tail.strip():
            yield element('p', value=child.tail)


def wrap_cover(row):
    """One scalable composition: typography stays together at any viewport ratio."""
    svg = ET.Element(f'{{{SVG}}}svg', nsmap={None: SVG}, viewBox='0 0 800 1120', role='img')
    ET.SubElement(svg, f'{{{SVG}}}title').text = row['author'] + ' — ' + row['title']
    ET.SubElement(svg, f'{{{SVG}}}rect', width='800', height='1120', fill='#f7f1e5')
    ET.SubElement(svg, f'{{{SVG}}}rect', x='38', y='38', width='724', height='1044', fill='none', stroke='#897044', **{'stroke-width': '2'})
    ET.SubElement(svg, f'{{{SVG}}}rect', x='47', y='47', width='706', height='1026', fill='none', stroke='#b5a27b')

    def lines(value, y, size, width, gap=None, colour='#302719'):
        rows = textwrap.wrap(value, width=width, break_long_words=False, break_on_hyphens=False)
        for i, line in enumerate(rows):
            node = ET.SubElement(svg, f'{{{SVG}}}text', x='400', y=str(y + i * (gap or size * 1.45)), fill=colour,
                                 **{'text-anchor': 'middle', 'font-family': 'Georgia, serif', 'font-size': str(size)})
            node.text = line
        return y + len(rows) * (gap or size * 1.45)

    lines(row['author'], 220, 31, 37)
    title_lines = textwrap.wrap(row['title'], width=26)
    lines(row['title'], 430 - max(0, len(title_lines) - 2) * 14, 43, 26, 61)
    ET.SubElement(svg, f'{{{SVG}}}path', d='M 335 680 H 465 M 400 665 V 695', stroke='#897044', fill='none')
    lines('Traduction française', 753, 22, 46)
    end = lines(row['translator'], 791, 21, 48, 29)
    lines(row.get('edition_label', 'Œuvres complètes — édition ' + row['edition']), max(920, end + 30), 19, 52, 26)
    lines(row['year'], 1003, 23, 50)
    return svg


def prepare(row, source_dir, output_dir):
    source = source_dir / row['source']
    original = source.read_bytes()
    with ZipFile(source) as archive:
        container = ET.fromstring(archive.read('META-INF/container.xml'))
        opf_path = container.find('.//{*}rootfile').get('full-path')
        opf = ET.fromstring(archive.read(opf_path))
        manifest = {i.get('id'): i for i in opf.findall('o:manifest/o:item', NS)}
        sources = []
        # These supplied files contain a generated title page and TOC before the
        # actual work. Select bodymatter content, never the generated front matter.
        for ref in opf.findall('o:spine/o:itemref', NS):
            item = manifest[ref.get('idref')]
            path = posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), unquote(item.get('href'))))
            root = ET.fromstring(archive.read(path))
            body = root.find('x:body', NS)
            if body is not None and body.get(f'{{{EPUB}}}type') == 'bodymatter' and len(xml(body)) > 2000:
                sources.append((path, body))
        if len(sources) != 1:
            raise ValueError(f'{source}: expected one Pandoc bodymatter document, found {len(sources)}')
        main_path, body = sources[0]
        removed_fonts = [n for n in archive.namelist() if n.lower().endswith(('.ttf', '.otf', '.woff', '.woff2'))]

    blocks = list(flatten(body))
    normalize = lambda value: re.sub(r'\s+', '', value)
    assert normalize(''.join(body.itertext())) == normalize(''.join(''.join(b.itertext()) for b in blocks)), 'Source text lost while flattening'
    # Matthieu has copied web navigation, ornamental publisher title pages and
    # repeated archive links before its historical Avertissement. Keep that
    # scholarly introduction; remove only the preceding web/print scaffolding.
    if row['source'].startswith('Chrysostome_'):
        first = next(i for i, b in enumerate(blocks) if tag(b) in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6') and text(b).upper() == 'AVERTISSEMENT.')
        blocks = blocks[first:]
        blocks[0].tag = f'{{{XHTML}}}h2'
        for b in blocks:
            if re.fullmatch(r'HOM[ÉE]LIE\s+(?:PREMIÈRE|[IVXLCDM]+)\.?', text(b), re.I):
                b.tag = f'{{{XHTML}}}h2'
            elif tag(b) == 'h1' and text(b).startswith('FIN DU COMMENTAIRE'):
                b.tag = f'{{{XHTML}}}p'
    # The new title page replaces the repeated work title inside the body.
    first_heading = next((b for b in blocks if tag(b) in ('h1', 'h2', 'h3')), None)
    if first_heading is not None and tag(first_heading) == 'h1':
        blocks.remove(first_heading)
    # Give endnotes their own navigation entry, rather than appending them to
    # the final chapter's text or leaving them absent from the new TOC.
    first_notes = next((i for i, b in enumerate(blocks) if tag(b) == 'ol' and b.find('.//*[@{%s}type="footnote"]' % EPUB) is not None), None)
    if first_notes is not None:
        blocks.insert(first_notes, element('h2', value='Notes'))
    # Preserve all remaining text, including editorial analyses and notes.
    content_signature = ''.join(''.join(b.itertext()) for b in blocks)
    for b in blocks:
        for e in b.iter():
            if not isinstance(e.tag, str):
                continue
            for key in list(e.attrib):
                if key in ('style', 'data-number') or key.startswith('on'):
                    del e.attrib[key]
            if tag(e) in ('script', 'iframe', 'object', 'embed', 'img'):
                raise ValueError(f'Unexpected active/image content: {tag(e)}')

    # Long endnote lists must also stay below the XHTML limit. Split only at
    # complete note boundaries, retaining list numbering and every text node.
    bounded_blocks = []
    for block in blocks:
        if len(xml(block)) <= CHUNK_BYTES:
            bounded_blocks.append(block)
            continue
        if tag(block) not in ('ol', 'ul'):
            raise ValueError(f'Cannot safely split oversized {tag(block)}')
        parts, current = [], copy.deepcopy(block)
        for child in list(current):
            current.remove(child)
        for index, child in enumerate(list(block)):
            if len(current) and len(xml(current)) + len(xml(child)) > CHUNK_BYTES:
                parts.append(current)
                current = ET.Element(block.tag, **{k: v for k, v in block.attrib.items() if k != 'id'})
                if tag(block) == 'ol':
                    current.set('start', str(index + int(block.get('start', '1'))))
            current.append(copy.deepcopy(child))
        parts.append(current)
        for part in parts[:-1]:
            part.tail = None
        bounded_blocks.extend(parts)
    blocks = bounded_blocks

    # Duplicate IDs in the original Matthieu affect old page-number anchors.
    # Keep first-target semantics for old links, give later occurrences unique IDs.
    used_ids = set()
    for b in blocks:
        for e in b.iter():
            identity = e.get('id')
            if identity:
                candidate, suffix = identity, 2
                while candidate in used_ids:
                    candidate = f'{identity}--{suffix}'
                    suffix += 1
                e.set('id', candidate)
                used_ids.add(candidate)

    # Each homily/book is a parent; articles/chapters remain children in EPUB nav.
    chapters = []
    chunk = []
    length = 0
    for b in blocks:
        size = len(xml(b))
        if size > CHUNK_BYTES:
            raise ValueError(f'A single block exceeds safe split size: {size}')
        if chunk and (tag(b) == 'h2' and any(text(item) for item in chunk) or length + size > CHUNK_BYTES):
            chapters.append(chunk)
            chunk, length = [], 0
        chunk.append(b)
        length += size
    if chunk:
        chapters.append(chunk)

    # Assign IDs before link resolution and navigation generation.
    counter = 0
    for group in chapters:
        for b in group:
            if tag(b) in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6') and not b.get('id'):
                counter += 1
                identity = f'heading-{counter}'
                while identity in used_ids:
                    counter += 1
                    identity = f'heading-{counter}'
                b.set('id', identity)
                used_ids.add(identity)

    docs = {}
    targets = {}
    for number, group in enumerate(chapters, 1):
        path = f'section-{number:03}.xhtml'
        heading = next((label(b) for b in group if tag(b) in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6')), 'Notes' if any(tag(b) == 'ol' for b in group) else row['title'])
        root, new_body = document(heading)
        new_body.set(f'{{{EPUB}}}type', 'bodymatter')
        for b in group:
            new_body.append(b)
            for e in b.iter():
                if e.get('id'):
                    targets[e.get('id')] = path
        docs[path] = root

    # Resolve every original internal link, including cross-chapter footnotes.
    link_count = 0
    removed_links = []
    for path, root in docs.items():
        for a in root.findall('.//x:a[@href]', NS):
            href = a.get('href')
            parsed = urlsplit(href)
            if parsed.scheme or parsed.netloc:
                continue
            dest_path = posixpath.normpath(posixpath.join(posixpath.dirname(main_path), unquote(parsed.path))) if parsed.path else main_path
            identity = unquote(parsed.fragment)
            if dest_path == main_path and identity in targets:
                a.set('href', targets[identity] + '#' + quote(identity, safe='-._~'))
                link_count += 1
            elif not identity and dest_path == main_path:
                a.set('href', 'section-001.xhtml')
            else:
                # Some copied Wikisource page-number links point outside the EPUB.
                # Preserve their text without pretending the destination exists.
                removed_links.append(href)
                del a.attrib['href']

    nav, nav_body = document('Table des matières')
    nav_el = element('nav', nav_body, id='toc')
    nav_el.set(f'{{{EPUB}}}type', 'toc')
    element('h1', nav_el, 'Table des matières')
    top_list = element('ol', nav_el)
    cover_li = element('li', top_list)
    element('a', cover_li, 'Page de garde', href='titlepage.xhtml')
    parents = {}
    for path, root in docs.items():
        for h in root.xpath('//x:body/x:h1|//x:body/x:h2|//x:body/x:h3', namespaces=NS):
            level = int(tag(h)[1])
            # The work title is already on its new page of title; no duplicate TOC row.
            if level == 1:
                continue
            title = label(h)
            if not title:
                continue
            if level == 2 or 2 not in parents:
                li = element('li', top_list)
                parents = {2: li}
            else:
                parent = parents[2]
                child_list = parent.find('x:ol', NS)
                if child_list is None:
                    child_list = element('ol', parent)
                li = element('li', child_list)
            element('a', li, title, href=path + '#' + quote(h.get('id'), safe='-._~'))
    landmarks = element('nav', nav_body, hidden='hidden')
    landmarks.set(f'{{{EPUB}}}type', 'landmarks')
    landmark_list = element('ol', landmarks)
    for kind, title, href in [('cover', 'Page de garde', 'titlepage.xhtml'), ('bodymatter', 'Texte', 'section-001.xhtml')]:
        link = element('a', element('li', landmark_list), title, href=href)
        link.set(f'{{{EPUB}}}type', kind)

    cover = wrap_cover(row)
    title_doc, title_body = document(row['title'])
    title_body.set(f'{{{EPUB}}}type', 'frontmatter')
    title_head = title_doc.find('x:head', NS)
    element('meta', title_head, name='calibre:cover', content='true')
    element('style', title_head, '''html,body { margin:0; padding:0; height:100%; }
.literae-cover { height:100%; width:100%; background:#f7f1e5; }
.literae-cover svg { display:block; height:100%; width:100%; }
''')
    element('div', title_body, **{'class': 'literae-cover'}).append(copy.deepcopy(cover))

    book_id = 'urn:uuid:' + str(uuid.uuid5(uuid.NAMESPACE_URL, 'literae:patristic:' + hashlib.sha256(original).hexdigest()))
    package = ET.Element(f'{{{OPF}}}package', nsmap={None: OPF}, version='3.0', **{'unique-identifier': 'publication-id', 'prefix': 'rendition: http://www.idpf.org/vocab/rendition/#'})
    meta = ET.SubElement(package, f'{{{OPF}}}metadata', nsmap={'dc': DC})
    for key, value in [('identifier', book_id), ('title', row['title']), ('language', 'fr'), ('creator', row['author']), ('contributor', row['translator']), ('date', row['year'][:4]), ('rights', row.get('rights', 'Édition historique ; vérification des droits requise avant publication.'))]:
        e = ET.SubElement(meta, f'{{{DC}}}{key}')
        e.text = value
        if key == 'identifier':
            e.set('id', 'publication-id')
    for source_url in row.get('sources', []):
        ET.SubElement(meta, f'{{{DC}}}source').text = source_url
    ET.SubElement(meta, f'{{{OPF}}}meta', property='dcterms:modified').text = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    ET.SubElement(meta, f'{{{OPF}}}meta', property='rendition:layout').text = 'reflowable'
    manifest = ET.SubElement(package, f'{{{OPF}}}manifest')
    for identity, href, media, properties in [('nav', 'nav.xhtml', 'application/xhtml+xml', 'nav'), ('css', 'style.css', 'text/css', ''), ('cover-image', 'cover.svg', 'image/svg+xml', 'cover-image'), ('titlepage', 'titlepage.xhtml', 'application/xhtml+xml', 'svg')]:
        item = ET.SubElement(manifest, f'{{{OPF}}}item', id=identity, href=href, **{'media-type': media})
        if properties:
            item.set('properties', properties)
    spine = ET.SubElement(package, f'{{{OPF}}}spine')
    ET.SubElement(spine, f'{{{OPF}}}itemref', idref='titlepage')
    for number, path in enumerate(docs, 1):
        ET.SubElement(manifest, f'{{{OPF}}}item', id=f'section-{number}', href=path, **{'media-type': 'application/xhtml+xml'})
        ET.SubElement(spine, f'{{{OPF}}}itemref', idref=f'section-{number}')

    assert ''.join(''.join(b.itertext()) for group in chapters for b in group) == content_signature, 'Body text changed'
    for path, root in docs.items():
        if len(xml(root)) >= MAX_BYTES:
            raise ValueError(f'{path} exceeds {MAX_BYTES} bytes after rewrite')
    container_bytes = b'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    filename = f"{row['author']} - {row['title']} (Traduction de {row['translator']} · {row['year']}).epub"
    # Keep an honest wording for editions naming a director rather than translator.
    filename = filename.replace('Traduction de sous la direction de ', 'Traduction sous la direction de ')
    filename = re.sub(r'Traduction de ([ÉEÀAÈIOU])', r'Traduction d’\1', filename)
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / filename
    with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr('mimetype', 'application/epub+zip', compress_type=ZIP_STORED)
        archive.writestr('META-INF/container.xml', container_bytes)
        archive.writestr('EPUB/package.opf', xml(package))
        archive.writestr('EPUB/style.css', CSS)
        archive.writestr('EPUB/nav.xhtml', xml(nav))
        archive.writestr('EPUB/titlepage.xhtml', xml(title_doc))
        archive.writestr('EPUB/cover.svg', xml(cover))
        for path, root in docs.items():
            archive.writestr('EPUB/' + path, xml(root))
    return {**row, 'output': filename, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'sections': len(docs), 'max_xhtml_bytes': max([len(xml(nav)), len(xml(title_doc)), *[len(xml(d)) for d in docs.values()]]),
            'internal_links_rewritten': link_count, 'obsolete_links_removed': sorted(set(removed_links)),
            'fonts_removed': removed_fonts, 'body_text_preserved': True}


if __name__ == '__main__':
    catalog, source_dir, output_dir = map(Path, sys.argv[1:])
    report = [prepare(row, source_dir, output_dir) for row in json.loads(catalog.read_text())]
    (output_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    for row in report:
        print(f"{row['title']}: {row['sections']} XHTML, max {row['max_xhtml_bytes']} bytes, {row['internal_links_rewritten']} internal links")
