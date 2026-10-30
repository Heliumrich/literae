#!/usr/bin/env python3
"""Rebuild the supplied Gutenberg, Wikisource and ELG books as clean EPUB 3.
No network or CMS access. Keep editorial content and source licences; see docs/LIBRARY-2026-10.md.
"""

from __future__ import annotations
import copy
import hashlib
import html.entities
import importlib.util
import json
import posixpath as path
import re
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from lxml import etree as E

spec = importlib.util.spec_from_file_location(
    "patristic", Path(__file__).with_name("prepare-patristic-epubs.py")
)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
X, EP, OPF, DC = base.XHTML, base.EPUB, base.OPF, base.DC
NS = {"x": X, "epub": EP, "o": OPF}
local, text, xml, element, document = (
    base.tag,
    base.text,
    base.xml,
    base.element,
    base.document,
)
LIMIT = 165_000


def parse(data):
    # Several valid EPUB 2 sources rely on the external XHTML entity DTD.
    data = re.sub(
        rb"&([A-Za-z][A-Za-z0-9]+);",
        lambda m: (
            ("&#%d;" % html.entities.name2codepoint[m[1].decode()]).encode()
            if m[1].decode() in html.entities.name2codepoint
            else m[0]
        ),
        data,
    )
    return E.fromstring(data)


def drop(node):
    parent = node.getparent()
    if parent is None:
        return
    if node.tail:
        previous = node.getprevious()
        if previous is not None:
            previous.tail = (previous.tail or "") + node.tail
        else:
            parent.text = (parent.text or "") + node.tail
    parent.remove(node)


def resolve(href, origin):
    u = urlsplit(href)
    if u.scheme or u.netloc:
        return None
    return (
        (
            path.normpath(path.join(path.dirname(origin), unquote(u.path)))
            if u.path
            else origin
        ),
        unquote(u.fragment),
    )


def image_extension(data, filename):
    # Wikimedia export names can end in query strings, not extensions.
    for signature, extension in [
        (b"\x89PNG", ".png"),
        (b"\xff\xd8", ".jpg"),
        (b"GIF8", ".gif"),
    ]:
        if data.startswith(signature):
            return extension
    extension = Path(filename).suffix.lower()
    assert extension == ".svg", ("Unsupported image", filename)
    return extension


def blocks_of(parent):
    """Unwrap layout containers while preserving mixed text and anchor IDs."""
    if parent.text and parent.text.strip():
        yield element("p", value=parent.text)
    for child in list(parent):
        if (
            local(child) in ("div", "section", "header", "footer")
            and child.get("role") != "doc-footnote"
        ):
            if child.get("id"):
                yield element("span", id=child.get("id"))
            yield from blocks_of(child)
        else:
            cloned = copy.deepcopy(child)
            cloned.tail = None
            yield cloned
        if child.tail and child.tail.strip():
            yield element("p", value=child.tail)


def clean(root, key, origin):
    for node in list(root.iter()):
        if not isinstance(node.tag, str):
            continue
        kind = local(node)
        classes = set(node.get("class", "").split())
        if (
            kind
            in ("script", "style", "link", "meta", "iframe", "object", "embed", "form")
            or "mw-cite-backlink" in classes
        ):
            drop(node)
            continue
        if (
            "footnote" in classes
            or node.get("role") in ("doc-footnote", "doc-endnote")
            or kind == "li"
            and any((n.get("id") or "").startswith("cite_note") for n in node.iter())
        ):
            node.tag = "{%s}%s" % (X, "li" if kind == "li" else "aside")
            node.set("{%s}type" % EP, "footnote")
            if kind == "li":
                node.attrib.pop("role", None)
            else:
                node.set("role", "doc-footnote")
        if key == "terre" and origin.endswith("/notes.html") and kind == "p":
            node.tag = "{%s}aside" % X
            node.set("{%s}type" % EP, "footnote")
            node.set("role", "doc-footnote")
            for a in node.findall(".//x:a[@href]", NS):
                a.set("role", "doc-backlink")
        if kind == "a" and ("fnanchor" in classes or "footnote-ref" in classes):
            node.set("{%s}type" % EP, "noteref")
            node.set("role", "doc-noteref")
        if kind == "a" and "#FNanchor_" in node.get("href", ""):
            node.set("role", "doc-backlink")
        # Hidden spacing duplicates in Wikisource are layout, not repeated prose.
        if "visibility:hidden" in node.get("style", "").replace(" ", ""):
            drop(node)
            continue
        for attr in list(node.attrib):
            if attr not in (
                "id",
                "href",
                "src",
                "alt",
                "title",
                "role",
                "lang",
                "colspan",
                "rowspan",
                "start",
                "value",
                "{%s}type" % EP,
                "{http://www.w3.org/XML/1998/namespace}lang",
            ):
                del node.attrib[attr]
        if (
            kind == "div"
            and node.getparent() is not None
            and local(node.getparent()) in ("h1", "h2", "h3", "h4", "h5", "h6", "p")
        ):
            node.tag = "{%s}span" % X
            # Removing a block boundary must not join the surrounding words.
            node.text = "\n" + (node.text or "")
            node.tail = "\n" + (node.tail or "")
    # Wikisource sometimes wraps multi-paragraph notes in a phrasing span.
    for node in list(root.iter())[::-1]:
        if local(node) in ("span", "p") and any(
            local(c) in ("div", "p", "ol", "ul", "table", "blockquote") for c in node
        ):
            node.tag = "{%s}div" % X
    return root


def select(row, name, body, index, count):
    key = row["key"]
    if row.get("source_profile") == "wikisource":
        if name.endswith(("title.xhtml", "about.xhtml")):
            return []
        clone = copy.deepcopy(body)
        # The export's root page mixes original epigraphs with a generated TOC.
        # Remove the identified TOC container, never discard the entire page.
        for node in list(clone.iter()):
            if (
                row.get("omit_repeated_title")
                and local(node) in ("h1", "h2", "h3")
                and text(node).casefold() == row["title"].casefold()
            ):
                drop(node)
                continue
            if set(node.get("class", "").split()) & {
                "ws-summary",
                "headertemplate",
                "headertemplate-journal",
            }:
                drop(node)
            if local(node) == "dl" and not node.findall("x:dt", NS):
                # Wiki indentation is exported as a definition list without terms.
                node.tag = "{%s}blockquote" % X
                for child in node.findall("x:dd", NS):
                    child.tag = "{%s}div" % X
            if local(node) == "hr" and any(
                local(a) in ("h1", "h2", "h3", "h4", "h5", "h6")
                for a in node.iterancestors()
            ):
                drop(node)  # A decorative rule cannot be a child of a heading.
        return [clone]
    if key in ("pascal", "maistre"):
        if name.endswith(("title.xhtml", "about.xhtml")) or re.search(r"/c0_", name):
            return []
        if key == "pascal" and "_Index." in name:
            return []
        return [copy.deepcopy(body)]
    if key in ("terre", "isolee", "barriere", "oberle"):
        if index < 2 or "propos de cette édition" in text(body)[:130]:
            return []
        return [copy.deepcopy(body)]
    if index == 0 or index == count - 1:
        return []
    clone = copy.deepcopy(body)
    if key in ("concupiscence", "oraisons"):
        if index == 1 or any(
            text(h) == "TABLE DES MATIÈRES" for h in clone.findall(".//x:h2", NS)
        ):
            return []
    if key == "imitation" and index == 1:
        children = list(clone)
        first = next(i for i, n in enumerate(children) if n.get("id") == "avert")
        for n in children[:first]:
            clone.remove(n)
    if key == "ble":
        children = list(clone)
        if index == 1:
            first = next(
                i for i, n in enumerate(children) if local(n) == "h3" and text(n) == "I"
            )
            for n in children[:first]:
                clone.remove(n)
        table = next(
            (n for n in list(clone) if local(n) == "h3" and text(n) == "TABLE"), None
        )
        if table is not None:
            for n in list(clone)[list(clone).index(table) :]:
                clone.remove(n)
    return [clone]


def prepare(row, input_dir, output_dir):
    if row.get("source_profile") != "wikisource" and row["key"] not in {
        "imitation",
        "pascal",
        "concupiscence",
        "oraisons",
        "ble",
        "terre",
        "isolee",
        "maistre",
        "barriere",
        "oberle",
    }:
        raise ValueError(
            "Add and review a source-selection profile before importing this edition"
        )
    source = input_dir / row["source"]
    original = source.read_bytes()
    with ZipFile(source) as archive:
        files = {n: archive.read(n) for n in archive.namelist()}
    opf_name = (
        parse(files["META-INF/container.xml"]).find(".//{*}rootfile").get("full-path")
    )
    opf = parse(files[opf_name])
    folder = path.dirname(opf_name)
    manifest = {i.get("id"): i for i in opf.findall(".//o:manifest/o:item", NS)}
    spine = [
        path.normpath(path.join(folder, unquote(manifest[r.get("idref")].get("href"))))
        for r in opf.findall("o:spine/o:itemref", NS)
    ]
    nav_labels = {}
    for item in manifest.values():
        if "nav" in item.get("properties", "").split():
            nav_name = path.normpath(path.join(folder, item.get("href")))
            for link in parse(files[nav_name]).xpath(
                '//x:nav[@epub:type="toc"]//x:a[@href]', namespaces=NS
            ):
                target = resolve(link.get("href"), nav_name)
                if target:
                    nav_labels.setdefault(target[0], text(link))
        if item.get("media-type") == "application/x-dtbncx+xml":
            nav_name = path.normpath(path.join(folder, item.get("href")))
            for point in parse(files[nav_name]).findall(".//{*}navPoint"):
                target = resolve(point.find("{*}content").get("src"), nav_name)
                if target:
                    nav_labels.setdefault(
                        target[0], point.find("{*}navLabel/{*}text").text
                    )
    blocks = []
    credits = []
    assets = {}
    for index, name in enumerate(spine):
        body = parse(files[name]).find("x:body", NS)
        if body is None:
            continue
        if (
            name.endswith("about.xhtml")
            or "propos de cette édition" in text(body)[:130]
            or index == len(spine) - 1
            and row["key"] in ("imitation", "concupiscence", "oraisons", "ble")
        ):
            credits.append((name, clean(copy.deepcopy(body), row["key"], name)))
        chosen = select(row, name, body, index, len(spine))
        for chosen_body in chosen:
            # Restore structural headings which the ELG/Wikisource exports represent as styled paragraphs/divs.
            if row["key"] in (
                "terre",
                "isolee",
                "barriere",
                "oberle",
            ) and not name.endswith("/notes.html"):
                first = next((n for n in chosen_body if text(n)), None)
                if first is not None:
                    first.tag = "{%s}h%d" % (
                        X,
                        (
                            3
                            if row["key"] == "isolee"
                            and Path(name).stem in ("007", "008", "009", "010")
                            else 2
                        ),
                    )
            if row["key"] == "maistre":
                for n in chosen_body.iter():
                    t = text(n)
                    if (
                        local(n) == "div"
                        and (len(t) < 140)
                        and (
                            t == "AVERTISSEMENT DE L’ÉDITEUR."
                            or t.startswith("CHAPITRE ")
                            or t == "POST-SCRIPTUM."
                        )
                    ):
                        n.tag = "{%s}h2" % X
            clean(chosen_body, row["key"], name)
            # Inline-only divs are paragraphs (dedications, addresses, poems).
            # Keep their inline spaces and line breaks together when unwrapping.
            unwrap = (
                base.flatten if row.get("source_profile") == "wikisource" else blocks_of
            )
            source_blocks = list(unwrap(chosen_body))
            if row.get("source_profile") == "wikisource":
                for b in source_blocks:
                    if local(b) == "div" and not any(
                        local(n)
                        in ("hr", "p", "div", "ul", "ol", "dl", "table", "blockquote")
                        for n in b.iterdescendants()
                    ):
                        b.tag = "{%s}p" % X
            assert re.sub(r"\s+", "", "".join(chosen_body.itertext())) == re.sub(
                r"\s+", "", "".join("".join(n.itertext()) for n in source_blocks)
            ), f"Text lost while unwrapping {name}"
            if row.get("source_profile") == "wikisource":
                # Empty page-break sentinels are export machinery, not prose.
                source_blocks = [
                    b
                    for b in source_blocks
                    if text(b).replace("\u200c", "").strip()
                    or b.get("id")
                    or b.findall(".//*[@id]")
                ]
                if not any(
                    text(b).replace("\u200c", "").strip() for b in source_blocks
                ):
                    continue
                headings = [
                    b
                    for b in source_blocks
                    if local(b) in ("h1", "h2", "h3", "h4", "h5", "h6")
                ]
                level = next(
                    (
                        rule["level"]
                        for rule in row.get("heading_rules", [])
                        if re.search(rule["pattern"], name)
                    ),
                    2,
                )
                if headings:
                    for i, h in enumerate(headings):
                        h.tag = "{%s}h%d" % (X, level if i == 0 else min(3, level + 1))
                else:
                    label = (
                        "Épigraphe et dédicace"
                        if re.search(r"/c0_", name)
                        else nav_labels.get(name)
                    )
                    assert label, ("Missing chapter label", name)
                    source_blocks.insert(
                        0, element("h%d" % level, value=label[0].upper() + label[1:])
                    )
            if row["key"] == "pascal":
                heading = next(
                    (
                        n
                        for n in source_blocks
                        if local(n).startswith("h") and local(n)[1:].isdigit()
                    ),
                    None,
                )
                if heading is not None:
                    heading.tag = "{%s}h2" % X
                else:
                    source_blocks.insert(
                        0,
                        element(
                            "h2",
                            value=nav_labels.get(
                                name, "Index" if "_Index." in name else row["title"]
                            ),
                        ),
                    )
            if row["key"] == "maistre" and not any(
                local(n) == "h2" for n in source_blocks
            ):
                source_blocks.insert(
                    0, element("h2", value=nav_labels.get(name, row["title"]))
                )
            for b in source_blocks:
                if (
                    row["key"] == "ble"
                    and local(b) == "h3"
                    and re.fullmatch("[IVXLCDM]+", text(b))
                ):
                    b.tag = "{%s}h2" % X
                if (
                    row["key"] == "oraisons"
                    and index in (10, 11, 12, 13)
                    and local(b) == "h2"
                ):
                    b.tag = "{%s}h3" % X
                if local(b) == "p" and not text(b) and not b.findall(".//*[@id]"):
                    continue
                blocks.append((name, b))
    # Keep licences and attribution after the work, never before its first chapter.
    for origin, body in credits:
        for b in blocks_of(body):
            if local(b) == "h2":
                b.tag = "{%s}h3" % X
            blocks.append((origin, b))
    # Mark the start of the collected source notices as a separate navigable part.
    if credits:
        start = len(blocks) - sum(len(list(blocks_of(body))) for _, body in credits)
        blocks.insert(start, ("__credits__", element("h2", value="Sources et crédits")))
    # Repackage all retained text and anchors. Every ID is scoped to its source document.
    content_signature = re.sub(
        r"\s+", "", "".join("".join(b.itertext()) for _, b in blocks)
    )
    chunks = []
    chunk = []
    size = 0
    for origin, b in blocks:
        length = len(xml(b))
        if length > LIMIT:
            raise ValueError(
                f'Oversized block: {row["key"]} {origin} {local(b)} {length}'
            )
        split = (
            local(b) in ("h2", "h3")
            and text(b)
            and chunk
            and any(text(n) for _, n in chunk)
        )
        # Reflections and voices belong to their Imitation chapter, not separate files.
        if (
            row["key"] == "imitation"
            and local(b) == "h3"
            and not text(b).startswith(("CHAPITRE ", "POUR LE JOUR", "PRATIQUE DE"))
        ):
            split = False
        if chunk and (split or size + length > LIMIT):
            chunks.append(chunk)
            chunk = []
            size = 0
        chunk.append((origin, b))
        size += length
    if chunk:
        chunks.append(chunk)
    targets = {}
    docs = {}
    counter = 0
    for number, group in enumerate(chunks, 1):
        name = f"section-{number:03}.xhtml"
        root, body = document(row["title"])
        for origin, b in group:
            for n in b.iter():
                if n.get("id"):
                    old = n.get("id")
                    new = (
                        "a-"
                        + hashlib.sha256((origin + "#" + old).encode()).hexdigest()[:24]
                    )
                    targets.setdefault((origin, old), (name, new))
                    n.set("id", new)
            if local(b) in ("h2", "h3") and not b.get("id"):
                counter += 1
                b.set("id", f"heading-{counter}")
            body.append(b)
        docs[name] = (root, group)
    rewritten = 0
    broken = []
    for name, (root, group) in docs.items():
        for origin, b in group:
            for a in (n for n in b.iter("{%s}a" % X) if n.get("href")):
                old = resolve(a.get("href"), origin)
                if old is None:
                    continue
                dest = targets.get(old)
                if dest:
                    a.set("href", dest[0] + "#" + dest[1])
                    rewritten += 1
                elif not old[1]:
                    target = next(
                        (
                            p
                            for p, (_, g) in docs.items()
                            if any(o == old[0] for o, _ in g)
                        ),
                        None,
                    )
                    if target:
                        a.set("href", target)
                    else:
                        broken.append(a.get("href"))
                        a.attrib.pop("href")
                else:
                    broken.append(a.get("href"))
                    a.attrib.pop("href")
            for img in b.iter("{%s}img" % X):
                resource = resolve(img.get("src"), origin)[0]
                data = files[resource]
                ext = image_extension(data, resource)
                new = "images/" + hashlib.sha256(files[resource]).hexdigest()[:20] + ext
                assets[new] = files[resource]
                img.set("src", new)
                img.set("alt", img.get("alt", ""))
    assert (
        re.sub(
            r"\s+",
            "",
            "".join(
                "".join(b.itertext()) for _, group in docs.values() for _, b in group
            ),
        )
        == content_signature
    ), "Body text changed"
    cover = base.wrap_cover(
        {
            **row,
            "translator": row["cover_credit"],
            "credit_role": row["cover_role"],
            "edition_label": row["cover_publisher"],
        }
    )
    title_doc, title_body = document(row["title"])
    element("meta", title_doc.find("x:head", NS), name="calibre:cover", content="true")
    element(
        "style",
        title_doc.find("x:head", NS),
        "html,body{margin:0;padding:0;height:100%}.literae-cover{height:100%;background:#f7f1e5}.literae-cover svg{display:block;width:100%;height:100%}",
    )
    element("div", title_body, **{"class": "literae-cover"}).append(
        copy.deepcopy(cover)
    )
    foreword, fb = document("Avis au lecteur")
    element("h2", fb, "Avis au lecteur")
    element("p", fb, row["edition"])
    nav, nb = document("Sommaire")
    nv = element("nav", nb, id="toc")
    nv.set("{%s}type" % EP, "toc")
    element("h1", nv, "Sommaire")
    top = element("ol", nv)
    for label, href in [
        ("Page de garde", "titlepage.xhtml"),
        ("Avis au lecteur", "foreword.xhtml"),
    ]:
        element("a", element("li", top), label, href=href)
    parents = {}
    for name, (root, group) in docs.items():
        for h in root.xpath("//x:body/x:h2|//x:body/x:h3", namespaces=NS):
            level = int(local(h)[1])
            label = base.label(h)
            if not label:
                continue
            if level == 2 or 2 not in parents:
                li = element("li", top)
                parents = {2: li}
            else:
                ol = parents[2].find("x:ol", NS)
                if ol is None:
                    ol = element("ol", parents[2])
                li = element("li", ol)
            element("a", li, label, href=name + "#" + h.get("id"))
    package = E.Element(
        "{%s}package" % OPF,
        nsmap={None: OPF},
        version="3.0",
        attrib={"unique-identifier": "publication-id"},
    )
    metadata = E.SubElement(package, "{%s}metadata" % OPF, nsmap={"dc": DC})
    rights = "Texte historique dans le domaine public. " + (
        "Transcription Wikisource : attribution et partage dans les mêmes conditions, CC BY-SA 3.0."
        if row["key"] in ("pascal", "maistre")
        or row.get("source_profile") == "wikisource"
        else "Voir les crédits et conditions de la transcription en fin de volume."
    )
    for key, val in [
        (
            "identifier",
            "urn:uuid:"
            + str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    "literae:" + hashlib.sha256(original).hexdigest(),
                )
            ),
        ),
        ("title", row["title"]),
        ("creator", row["author"]),
        ("contributor", row["credit"]),
        ("date", row["year"]),
        ("language", "fr"),
        ("rights", rights),
        ("source", row["sources"][0]),
    ]:
        n = E.SubElement(metadata, "{%s}%s" % (DC, key))
        n.text = val
        if key == "identifier":
            n.set("id", "publication-id")
    E.SubElement(metadata, "{%s}meta" % OPF, property="dcterms:modified").text = (
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    mf = E.SubElement(package, "{%s}manifest" % OPF)
    sp = E.SubElement(package, "{%s}spine" % OPF)
    content = {
        "nav.xhtml": xml(nav),
        "titlepage.xhtml": xml(title_doc),
        "foreword.xhtml": xml(foreword),
        "cover.svg": xml(cover),
        "style.css": base.CSS
        + "\nimg{max-width:100%;height:auto}body{font-family:serif}",
    }
    content.update({name: xml(root) for name, (root, _) in docs.items()})
    content.update(assets)
    for i, (name, data) in enumerate(content.items()):
        mime = {
            ".xhtml": "application/xhtml+xml",
            ".svg": "image/svg+xml",
            ".css": "text/css",
            ".png": "image/png",
            ".gif": "image/gif",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        }[Path(name).suffix.lower()]
        item = E.SubElement(
            mf, "{%s}item" % OPF, id=f"item-{i}", href=name, attrib={"media-type": mime}
        )
        if name == "nav.xhtml":
            item.set("properties", "nav")
        if name == "cover.svg":
            item.set("properties", "cover-image")
        if name == "titlepage.xhtml":
            item.set("properties", "svg")
        if name in ["titlepage.xhtml", "foreword.xhtml", *docs]:
            E.SubElement(sp, "{%s}itemref" % OPF, idref=f"item-{i}")
    assert all(
        len(data) < 250_000 for name, data in content.items() if name.endswith(".xhtml")
    )
    filename = f"{row['author']} - {row['title']} ({row['edition_label']}).epub"
    output_dir.mkdir(exist_ok=True, parents=True)
    with ZipFile(output_dir / filename, "w", ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        z.writestr(
            "META-INF/container.xml",
            b'<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        z.writestr("EPUB/package.opf", xml(package))
        for name, data in content.items():
            z.writestr("EPUB/" + name, data.encode() if isinstance(data, str) else data)
    (output_dir / (row["key"] + "-cover.svg")).write_bytes(xml(cover))
    return {
        **row,
        "output": filename,
        "source_sha256": hashlib.sha256(original).hexdigest(),
        "sha256": hashlib.sha256((output_dir / filename).read_bytes()).hexdigest(),
        "sections": len(docs),
        "max_xhtml_bytes": max(
            len(data) for name, data in content.items() if name.endswith(".xhtml")
        ),
        "links_rewritten": rewritten,
        "obsolete_links_removed": sorted(set(broken)),
        "body_text_preserved": True,
    }


if __name__ == "__main__":
    catalog, input_dir, output_dir = map(Path, sys.argv[1:])
    rows = json.loads(catalog.read_text())
    reports = []
    for row in rows:
        report = prepare(row, input_dir, output_dir)
        reports.append(report)
        print(
            row["key"],
            report["sections"],
            "parts;",
            len(report["obsolete_links_removed"]),
            "obsolete links",
            flush=True,
        )
    (output_dir / "report.json").write_text(
        json.dumps(reports, ensure_ascii=False, indent=2) + "\n"
    )
