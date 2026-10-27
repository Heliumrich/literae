"""Move Wikisource EPUB notes out of the spine. Usage: python script INPUT OUTPUT.
Requires lxml. Never overwrites INPUT; produces a JSON conversion report on stdout.
"""
import sys, json, posixpath as path, hashlib
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from urllib.parse import urlsplit, unquote
from lxml import etree as E

X = 'http://www.w3.org/1999/xhtml'
EPUB = 'http://www.idpf.org/2007/ops'
OPF = 'http://www.idpf.org/2007/opf'
def prepare(source, target):
    assert Path(source).resolve() != Path(target).resolve(), 'Use a separate output file'
    with ZipFile(source) as z:
        files = {n: z.read(n) for n in z.namelist()}
    assert not any('/literae-notes/' in n for n in files), 'Already prepared'
    docs = {n: E.fromstring(b) for n, b in files.items() if n.endswith(('.xhtml', '.html'))}
    mapping, grouped, moved = {}, {}, []
    for name, doc in docs.items():
        notes = doc.xpath('//*[local-name()="li" and starts-with(@id,"cite_note") or @*[local-name()="type" and .="footnote"]]')
        notes = [n for n in notes if not any(a in notes for a in n.iterancestors())]
        if not notes: continue
        # pNNN-CCC chapter names share one pNNN biblical-book group.
        stem = path.basename(name).rsplit('.', 1)[0]
        group = stem.split('-')[0]
        dest = path.join(path.dirname(name), 'literae-notes', group + '.xhtml')
        if dest not in grouped:
            root = E.Element('{%s}html' % X, nsmap={None:X, 'epub':EPUB}, lang='fr')
            head = E.SubElement(root, '{%s}head' % X)
            E.SubElement(head, '{%s}title' % X).text = 'Notes — ' + group
            E.SubElement(root, '{%s}body' % X)
            grouped[dest] = root
        note_parents = set()
        for note in notes:
            for element in note.iter():
                old = element.get('id')
                if old:
                    new = stem + '--' + old
                    mapping[(name, old)] = (dest, new)
                    element.set('id', new)
            parent = note.getparent()
            note_parents.add(parent)
            parent.remove(note)
            note.tag = '{%s}aside' % X
            note.set('{%s}type' % EPUB, 'footnote')
            grouped[dest].find('{%s}body' % X).append(note)
            moved.append((note, name, dest))
        # Remove now-empty note lists and reference wrappers.
        for node in list(doc.iter())[::-1]:
            if node.getparent() is not None and (node in note_parents or node.get('class') in ('references','reflist')) and not len(node) and not (node.text or '').strip():
                node.getparent().remove(node)
        head = doc.find('{%s}head' % X)
        E.SubElement(head, '{%s}link' % X, rel='literae-notes', href=path.relpath(dest, path.dirname(name)))
    def links(root, original, current):
        for el in root.iter():
            href = el.get('href')
            if not href: continue
            u = urlsplit(href)
            if u.scheme or u.netloc: continue
            dest = path.normpath(path.join(path.dirname(original), unquote(u.path))) if u.path else original
            match = mapping.get((dest, unquote(u.fragment)))
            if match:
                el.set('href', path.relpath(match[0], path.dirname(current)) + '#' + match[1])
                el.set('{%s}type' % EPUB, 'noteref')
            elif original != current:
                el.set('href', path.relpath(dest, path.dirname(current)) + ('#'+u.fragment if u.fragment else ''))
    for name, doc in docs.items(): links(doc, name, name)
    for note, original, dest in moved: links(note, original, dest)
    opf_name = next(n for n in files if n.endswith('.opf'))
    opf = E.fromstring(files[opf_name]); manifest = opf.find('{%s}manifest' % OPF)
    for i, name in enumerate(grouped):
        E.SubElement(manifest, '{%s}item' % OPF, id=f'literae-notes-{i}', href=path.relpath(name, path.dirname(opf_name)), attrib={'media-type':'application/xhtml+xml'})
        E.SubElement(opf.find('{%s}spine' % OPF), '{%s}itemref' % OPF, idref=f'literae-notes-{i}', linear='no')
    files[opf_name] = E.tostring(opf, encoding='utf-8', xml_declaration=True)
    for name, doc in {**docs, **grouped}.items(): files[name] = E.tostring(doc, encoding='utf-8', xml_declaration=True)
    # Check every moved target, including IDs nested inside a note.
    ids = {n: {el.get('id') for el in doc.iter() if el.get('id')} for n, doc in grouped.items()}
    assert all(ident in ids[name] for name, ident in mapping.values())
    assert all(s.get('linear') == 'no' for s in opf.find('{%s}spine' % OPF) if s.get('idref','').startswith('literae-notes-'))
    with ZipFile(target, 'w', ZIP_DEFLATED) as z:
        z.writestr('mimetype', files.pop('mimetype'), compress_type=ZIP_STORED)
        for name, data in files.items(): z.writestr(name, data)
    return {'source':str(source), 'output':str(target), 'notes':len(moved), 'files':len(grouped), 'largestNotesBytes':max((len(files[n]) for n in grouped), default=0), 'sha256':hashlib.sha256(Path(target).read_bytes()).hexdigest()}
if __name__ == '__main__': print(json.dumps(prepare(*sys.argv[1:]), ensure_ascii=False))
