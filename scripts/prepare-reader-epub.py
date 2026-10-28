#!/usr/bin/env python3
"""Prepare web notes and French nonbreaking punctuation; keep an e-reader variant.
Requires lxml. No CMS/network access. See docs/EPUB-NOTES.md.
"""

from __future__ import annotations
import argparse
import bisect
import copy
import hashlib
import json
import posixpath as path
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from lxml import etree as E

X = "http://www.w3.org/1999/xhtml"
EPUB = "http://www.idpf.org/2007/ops"
OPF = "http://www.idpf.org/2007/opf"
NS = {"x": X, "epub": EPUB, "o": OPF}
BLOCKS = {
    "body",
    "p",
    "div",
    "section",
    "aside",
    "li",
    "ul",
    "ol",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "td",
    "th",
    "dt",
    "dd",
    "pre",
    "table",
    "tr",
    "br",
    "hr",
}
PUNCT = re.compile(r"[ \t\r\n\u202f]+(?=[:;?!])")
LIMIT = 190_000


def local(node):
    return E.QName(node).localname if isinstance(node.tag, str) else ""


def serialize(root):
    return E.tostring(root, encoding="utf-8", xml_declaration=True)


def load(source):
    with ZipFile(source) as z:
        files = {n: z.read(n) for n in z.namelist()}
    container = E.fromstring(files["META-INF/container.xml"])
    opf_name = container.find(".//{*}rootfile").get("full-path")
    opf = E.fromstring(files[opf_name])
    docs = {
        n: E.fromstring(b)
        for n, b in files.items()
        if n.endswith((".xhtml", ".html", ".htm"))
    }
    return files, opf_name, opf, docs


def write(target, files):
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("mimetype", files["mimetype"], compress_type=ZIP_STORED)
        for name, data in files.items():
            if name != "mimetype":
                z.writestr(name, data)


def punctuation(doc):
    """Operate on text runs across inline elements, never attributes or styles."""
    changed = 0
    slots = []

    def flush():
        nonlocal changed
        if not slots:
            return
        values = [getattr(node, attr) or "" for node, attr in slots]
        offsets, length = [], 0
        for value in values:
            offsets.append(length)
            length += len(value)
        edits = defaultdict(list)
        for match in PUNCT.finditer("".join(values)):
            first = bisect.bisect_right(offsets, match.start()) - 1
            last = bisect.bisect_right(offsets, match.end() - 1) - 1
            for i in range(first, last + 1):
                start, end = max(0, match.start() - offsets[i]), min(
                    len(values[i]), match.end() - offsets[i]
                )
                edits[i].append((start, end, "\u00a0" if i == last else ""))
            changed += 1
        for i, changes in edits.items():
            value = values[i]
            for start, end, replacement in reversed(changes):
                value = value[:start] + replacement + value[end:]
            setattr(slots[i][0], slots[i][1], value)
        slots.clear()

    def visit(node):
        if local(node) in ("script", "style", "pre", "code"):
            flush()
            return
        if local(node) in BLOCKS:
            flush()
        if node.text:
            slots.append((node, "text"))
        for child in node:
            visit(child)
            if child.tail:
                slots.append((child, "tail"))
        if local(node) in BLOCKS:
            flush()

    visit(doc)
    flush()
    return changed


def renumber_ncx(root):
    order = {}
    for point in root.iter():
        if point.get("playOrder") is None:
            continue
        content = point.find("{*}content")
        location = content.get("src") if content is not None else None
        if location not in order:
            order[location] = len(order) + 1
        point.set("playOrder", str(order[location]))


def normalise(source):
    files, opf_name, opf, docs = load(source)
    count = sum(punctuation(doc) for doc in docs.values())
    for name, data in list(files.items()):
        if name.endswith(".ncx"):
            ncx = E.fromstring(data)
            renumber_ncx(ncx)
            files[name] = serialize(ncx)
    for name, doc in docs.items():
        files[name] = serialize(doc)
    return files, opf_name, opf, docs, count


def resolve(href, source):
    url = urlsplit(href)
    if url.scheme or url.netloc:
        return None
    name = (
        path.normpath(path.join(path.dirname(source), unquote(url.path)))
        if url.path
        else source
    )
    return name, unquote(url.fragment)


def reference(href, current):
    return path.relpath(href[0], path.dirname(current)) + (
        "#" + quote(href[1], safe="-._~") if href[1] else ""
    )


def is_note(node):
    kinds = (node.get("{%s}type" % EPUB) or "").split()
    return (
        bool(set(kinds) & {"footnote", "endnote"})
        or node.get("role") in ("doc-footnote", "doc-endnote")
        or (node.get("id") or "").startswith("cite_note")
        or local(node) == "li"
        and any((child.get("id") or "").startswith("cite_note") for child in node)
    )


def prepare(source, target, download=None, download_source=None):
    assert Path(source).resolve() != Path(target).resolve()
    files, opf_name, opf, docs, nbsp = normalise(source)
    assert not any(
        "/literae-notes/" in n for n in files
    ), "Use the original e-reader EPUB as input"
    if download:
        assert Path(download).resolve() not in (
            Path(source).resolve(),
            Path(target).resolve(),
        )
        download_files, _, _, _, download_nbsp = normalise(download_source or source)
        write(download, download_files)
    else:
        download_nbsp = None
    manifest = opf.find("o:manifest", NS)
    spine = opf.find("o:spine", NS)
    base = path.dirname(opf_name)
    by_id = {
        item.get("id"): path.normpath(path.join(base, unquote(item.get("href"))))
        for item in manifest
    }
    linear = [by_id[ref.get("idref")] for ref in spine if ref.get("linear") != "no"]
    nav_names = {
        by_id[item.get("id")]
        for item in manifest
        if "nav" in (item.get("properties") or "").split()
    }
    groups = {}
    for name in nav_names:
        nav = docs[name].find('.//x:nav[@epub:type="toc"]', NS)
        if nav is None:
            continue
        for li in nav.findall("x:ol/x:li", NS):
            a = li.find("x:a", NS)
            label = " ".join(a.itertext()).strip() if a is not None else ""
            for link in li.findall(".//x:a[@href]", NS):
                dest = resolve(link.get("href"), name)
                if dest:
                    groups.setdefault(dest[0], label)
    # Every descendant ID resolves to the owning whole note, not a truncated span.
    notes, aliases, parents = {}, {}, set()
    for name, doc in docs.items():
        found = [n for n in doc.iter() if is_note(n)]
        found = [n for n in found if not any(is_note(a) for a in n.iterancestors())]
        for index, note in enumerate(found):
            key = (name, note.get("id") or f"anonymous-{index}")
            notes[key] = note
            for child in note.iter():
                identity = child.get("id")
                if identity:
                    assert (
                        name,
                        identity,
                    ) not in aliases, f"Duplicate note ID: {name}#{identity}"
                    aliases[(name, identity)] = key
            parents.update(note.iterancestors())
    ref_nodes, wanted = [], defaultdict(set)
    for name in linear:
        for a in docs[name].findall(".//x:a[@href]", NS):
            if any(is_note(n) for n in a.iterancestors()):
                continue
            destination = resolve(a.get("href"), name)
            owner = aliases.get(destination)
            if owner:
                wanted[name].add(owner)
                ref_nodes.append((name, a, destination, owner))
    # Include notes cited by another note, in the same local preload group.
    for origin, keys in wanted.items():
        pending = list(keys)
        while pending:
            owner = pending.pop()
            for a in notes[owner].findall(".//x:a[@href]", NS):
                linked = aliases.get(resolve(a.get("href"), owner[0]))
                if linked and linked not in keys:
                    keys.add(linked)
                    pending.append(linked)
    referenced = set().union(*wanted.values()) if wanted else set()
    unreferenced = set(notes) - referenced
    if unreferenced:
        raise ValueError(
            f"{len(unreferenced)} notes have no reference; inspect the source before publishing"
        )
    # Move, rather than hide in CSS: no notes remain in any linear content document.
    for note in notes.values():
        parent = note.getparent()
        if note.tail and note.tail.strip():
            previous = note.getprevious()
            if previous is not None:
                previous.tail = (previous.tail or "") + note.tail
            else:
                parent.text = (parent.text or "") + note.tail
        parent.remove(note)
    for name, doc in docs.items():
        for node in list(doc.iter())[::-1]:
            if node.getparent() is None:
                continue
            if (
                local(node) in ("ol", "ul")
                and not len(node)
                and not (node.text or "").strip()
            ):
                node.getparent().remove(node)
            elif node in parents and local(node) not in ("html", "body"):
                meaningful = [
                    e
                    for e in node.iter()
                    if local(e)
                    not in ("section", "div", "span", "h1", "h2", "h3", "hr")
                    and "".join(e.itertext()).strip()
                ]
                if not meaningful and local(node) in ("section", "div", "li", "p"):
                    node.getparent().remove(node)
    hidden_originals = set()
    for name in linear:
        body = docs[name].find("x:body", NS)
        if body is None:
            continue
        words = re.sub(r"\s+", " ", "".join(body.itertext())).strip().lower()
        if any(key[0] == name for key in notes) and words in (
            "",
            "notes",
            "notae",
            "footnotes",
            "références",
        ):
            hidden_originals.add(name)
    # Empty former endnote chapters are removed entirely, not left unreachable
    # in the spine (which would violate EPUB's non-linear-content rule).
    for ref in list(spine):
        if by_id[ref.get("idref")] in hidden_originals:
            spine.remove(ref)
    for item in list(manifest):
        if by_id[item.get("id")] in hidden_originals:
            manifest.remove(item)
    for name in hidden_originals:
        files.pop(name, None)
        docs.pop(name, None)
    # Rebuild small local note files. One group per question, homily or chapter.
    generated, mapped, source_links = {}, {}, defaultdict(list)
    for origin, keys in wanted.items():
        stem = (
            path.basename(origin).rsplit(".", 1)[0]
            if origin != "__unreferenced__"
            else "unreferenced"
        )
        stem += "-" + hashlib.sha256(origin.encode()).hexdigest()[:8]
        chunks, chunk, size = [], [], 0
        for owner in sorted(keys):
            length = len(serialize(notes[owner]))
            assert length < LIMIT, f"A single note is too large: {owner}"
            if chunk and size + length > LIMIT:
                chunks.append(chunk)
                chunk, size = [], 0
            chunk.append(owner)
            size += length
        if chunk:
            chunks.append(chunk)
        for number, chunk in enumerate(chunks):
            destination = path.join(
                base,
                "literae-notes",
                stem + (f"-{number+1}" if len(chunks) > 1 else "") + ".xhtml",
            )
            language = docs.get(origin, next(iter(docs.values()))).get("lang", "fr")
            root = E.Element(
                "{%s}html" % X, nsmap={None: X, "epub": EPUB}, lang=language
            )
            root.set("{http://www.w3.org/XML/1998/namespace}lang", language)
            head = E.SubElement(root, "{%s}head" % X)
            E.SubElement(head, "{%s}title" % X).text = "Notes"
            body = E.SubElement(root, "{%s}body" % X)
            for owner in chunk:
                clone = copy.deepcopy(notes[owner])
                clone.tail = None
                clone.tag = "{%s}aside" % X
                clone.attrib.pop("value", None)
                clone.set("{%s}type" % EPUB, "footnote")
                clone.set("role", "doc-footnote")
                identity = (
                    "n-"
                    + hashlib.sha256((owner[0] + "#" + owner[1]).encode()).hexdigest()[
                        :24
                    ]
                )
                for node in clone.iter():
                    old = node.get("id")
                    if old:
                        new = (
                            identity
                            if old == owner[1]
                            else identity
                            + "-"
                            + hashlib.sha256(old.encode()).hexdigest()[:12]
                        )
                        mapped[(origin, owner[0], old)] = (destination, new)
                        node.set("id", new)
                if not clone.get("id"):
                    clone.set("id", identity)
                body.append(clone)
            generated[destination] = (root, origin, chunk)
            source_links[origin].append(destination)

    def remap(root, original, current, context):
        for a in root.findall(".//x:a[@href]", NS):
            old = resolve(a.get("href"), original)
            if old is None:
                continue
            dest = mapped.get((context, *old))
            if dest:
                a.set("href", reference(dest, current))
            elif original != current:
                a.set("href", reference(old, current))

    for destination, (doc, origin, chunk) in generated.items():
        for clone, owner in zip(doc.find("x:body", NS), chunk):
            remap(clone, owner[0], destination, origin)
    references = defaultdict(list)
    for name, a, old, owner in ref_nodes:
        destination = mapped[(name, *old)]
        a.set("href", reference(destination, name))
        a.set("{%s}type" % EPUB, "noteref")
        a.set("role", "doc-noteref")
        a.set(
            "class",
            " ".join(dict.fromkeys((a.get("class", "") + " literae-noteref").split())),
        )
        references[name].append(
            {
                "href": a.get("href"),
                "id": destination[1],
                "path": destination[0],
                "label": "".join(a.itertext()).strip(),
            }
        )
    for name, links in source_links.items():
        if name not in docs:
            continue
        head = docs[name].find("x:head", NS)
        for destination in links:
            E.SubElement(
                head,
                "{%s}link" % X,
                rel="literae-notes",
                href=path.relpath(destination, path.dirname(name)),
            )
    # Hide old note-only documents from both EPUB 3 nav and legacy NCX.
    for name, doc in docs.items():
        if name not in nav_names:
            continue
        for li in list(doc.findall(".//x:li", NS))[::-1]:
            a = li.find("x:a[@href]", NS)
            destination = resolve(a.get("href"), name) if a is not None else None
            if destination and destination[0] in hidden_originals:
                li.getparent().remove(li)
    for name, data in list(files.items()):
        if not name.endswith(".ncx"):
            continue
        ncx = E.fromstring(data)
        for point in list(ncx.findall(".//{*}navPoint"))[::-1]:
            content = point.find("{*}content")
            destination = (
                resolve(content.get("src"), name) if content is not None else None
            )
            if destination and destination[0] in hidden_originals:
                point.getparent().remove(point)
        renumber_ncx(ncx)
        files[name] = serialize(ncx)
    for index, (name, (doc, _, _)) in enumerate(generated.items()):
        identity = f"literae-notes-{index}"
        E.SubElement(
            manifest,
            "{%s}item" % OPF,
            id=identity,
            href=path.relpath(name, base),
            attrib={"media-type": "application/xhtml+xml"},
        )
        E.SubElement(spine, "{%s}itemref" % OPF, idref=identity, linear="no")
        files[name] = serialize(doc)
        assert len(files[name]) < 250_000, f"Notes document too large: {name}"
    for name, doc in docs.items():
        files[name] = serialize(doc)
    files[opf_name] = serialize(opf)
    ids = {
        name: {n.get("id") for n in doc.iter() if n.get("id")}
        for name, (doc, _, _) in generated.items()
    }
    assert all(
        ref["id"] in ids[ref["path"]] for refs in references.values() for ref in refs
    )
    assert all(
        not any(is_note(n) for n in docs[name].iter())
        for name in linear
        if name not in hidden_originals
    )
    # The text of every original note survives in at least one generated aside.
    assert all(
        any(owner in chunk for _, _, chunk in generated.values()) for owner in notes
    )
    write(target, files)
    actual_linear = [n for n in linear if n not in hidden_originals]
    samples = []
    for name in actual_linear:
        if references[name]:
            position = actual_linear.index(name)
            nearby = actual_linear[max(0, position - 1) : position + 2]
            samples.append(
                {
                    "source": name,
                    "href": path.relpath(name, base),
                    "group": groups.get(name, ""),
                    "reference": references[name][0],
                    "allowedPaths": list(
                        dict.fromkeys(n for s in nearby for n in source_links[s])
                    ),
                }
            )
    return {
        "source": str(source),
        "web": str(target),
        "download": str(download) if download else None,
        "nbsp": nbsp,
        "downloadNbsp": download_nbsp,
        "notes": len(notes),
        "noteCopies": sum(len(chunk) for _, _, chunk in generated.values()),
        "references": len(ref_nodes),
        "unreferenced": len(unreferenced),
        "noteFiles": len(generated),
        "maxNotesBytes": max((len(files[n]) for n in generated), default=0),
        "hiddenOriginals": sorted(hidden_originals),
        "linear": actual_linear,
        "sourceLinks": dict(source_links),
        "samples": samples,
        "sha256": hashlib.sha256(Path(target).read_bytes()).hexdigest(),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--download", type=Path)
    parser.add_argument("--download-source", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = prepare(args.source, args.target, args.download, args.download_source)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                k: v
                for k, v in report.items()
                if k not in ("samples", "sourceLinks", "linear")
            },
            ensure_ascii=False,
        )
    )
