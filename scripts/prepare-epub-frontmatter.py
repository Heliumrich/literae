#!/usr/bin/env python3
"""Replace EPUB covers and editorial notices. Requires lxml and Pillow; no CMS access."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import posixpath
from urllib.parse import unquote
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED

from lxml import etree as E
from PIL import Image, ImageDraw, ImageFont

X = "http://www.w3.org/1999/xhtml"
O = "http://www.idpf.org/2007/opf"
EP = "http://www.idpf.org/2007/ops"
NS = {"x": X, "o": O, "epub": EP}
FONT = "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf"


def xml(root):
    return E.tostring(root, encoding="utf-8", xml_declaration=True)


def document(title):
    root = E.Element("{%s}html" % X, nsmap={None: X}, lang="fr")
    root.set("{http://www.w3.org/XML/1998/namespace}lang", "fr")
    head = E.SubElement(root, "{%s}head" % X)
    E.SubElement(head, "{%s}meta" % X, charset="utf-8")
    E.SubElement(head, "{%s}title" % X).text = title
    return root, head, E.SubElement(root, "{%s}body" % X)


def cover_lines(entry, font_path=FONT):
    """Shared line wrapping for the vector web cover and the e-reader JPEG."""
    image = Image.new("RGB", (1200, 1680), "#f7f1e5")
    draw = ImageDraw.Draw(image)
    lines_out = []

    def block(value, centre_y, size, maximum_height, width=990):
        if not value:
            return
        while size >= 20:
            font = ImageFont.truetype(str(font_path), size)
            lines, current = [], ""
            for word in value.split():
                candidate = current + (" " if current else "") + word
                if draw.textlength(candidate, font=font) > width and current:
                    lines.append(current)
                    current = word
                else:
                    current = candidate
            lines.append(current)
            step = round(size * 1.45)
            if len(lines) * step <= maximum_height and all(
                draw.textlength(line, font=font) <= width for line in lines
            ):
                break
            size -= 1
        else:
            raise ValueError("Cover text does not fit: " + value)
        y = centre_y - len(lines) * step / 2
        for line in lines:
            lines_out.append((line, y, size))
            y += step

    block(entry["author"], 300, 46, 150)
    block(entry.get("cover_title", entry["title"]), 680, 66, 380)

    block(entry["origin_label"] + " : " + entry["origin_date"], 1085, 30, 90)
    block(entry.get("credit", ""), 1195, 30, 130)
    block(entry["publisher"], 1380, 30, 160)
    block(entry["edition_date"], 1530, 38, 70)
    return lines_out


def cover_image(entry, font_path=FONT):
    """A baseline JPEG: no SVG renderer or embedded fonts required on e-readers."""
    image = Image.new("RGB", (1200, 1680), "#f7f1e5")
    draw = ImageDraw.Draw(image)
    draw.rectangle((58, 58, 1142, 1622), outline="#715b32", width=3)
    draw.rectangle((72, 72, 1128, 1608), outline="#9a8864", width=2)
    draw.line((500, 1000, 700, 1000), fill="#715b32", width=2)
    draw.line((600, 980, 600, 1020), fill="#715b32", width=2)
    for line, y, size in cover_lines(entry, font_path):
        draw.text((600, y), line, font=ImageFont.truetype(str(font_path), size),
                  fill="#302719", anchor="mt")
    output = BytesIO()
    image.save(output, "JPEG", quality=90, optimize=True, progressive=False, subsampling=0)
    return output.getvalue()


def cover_svg(entry):
    """Inline vector artwork for EPUB.js; independent of image loading and book CSS."""
    ns = "http://www.w3.org/2000/svg"
    svg = E.Element("{%s}svg" % ns, nsmap={None: ns},
                    viewBox="0 0 1200 1680", role="img", preserveAspectRatio="xMidYMid meet")
    E.SubElement(svg, "{%s}title" % ns).text = entry["author"] + " – " + entry["title"]
    E.SubElement(svg, "{%s}rect" % ns, width="1200", height="1680", fill="#f7f1e5")
    for x, y, w, h, color, stroke in [(58,58,1084,1564,"#715b32",3),(72,72,1056,1536,"#9a8864",2)]:
        E.SubElement(svg, "{%s}rect" % ns, x=str(x), y=str(y), width=str(w), height=str(h),
                     fill="none", stroke=color, attrib={"stroke-width":str(stroke)})
    E.SubElement(svg, "{%s}path" % ns, d="M500 1000 H700 M600 980 V1020", stroke="#715b32",
                 fill="none", attrib={"stroke-width":"2"})
    for line, y, size in cover_lines(entry):
        E.SubElement(svg, "{%s}text" % ns, x="600", y=str(y + size), fill="#302719",
                     attrib={"text-anchor":"middle", "font-family":"Georgia, serif", "font-size":str(size)}).text = line
    return svg


def keep_ids(old, body):
    """Preserve incoming fragments without preserving discarded editorial prose."""
    for identity in dict.fromkeys(old.xpath("//@id")):
        E.SubElement(body, "{%s}span" % X, id=identity)


def cover_document(old, entry, image_href, kind="download"):
    root, head, body = document(entry["title"])
    E.SubElement(head, "{%s}meta" % X, name="calibre:cover", content="true")
    if kind == "web":
        E.SubElement(head, "{%s}style" % X).text = """
html,body{margin:0;padding:0;height:100%;background:#f7f1e5}
.literae-cover{height:100%;width:100%;margin:0;padding:0}
.literae-cover svg{display:block;height:100%;width:100%}
"""
        keep_ids(old, body)
        E.SubElement(body, "{%s}div" % X, attrib={"class":"literae-cover"}).append(cover_svg(entry))
        return root
    # A single percentage dimension preserves the intrinsic image ratio in
    # Crosspoint. Its parser stretches images when width AND height are 100%.
    E.SubElement(head, "{%s}style" % X).text = """
html,body{margin:0;padding:0;height:100%;background:#f7f1e5}
.literae-cover{height:100%;margin:0;padding:0;text-align:center}
.literae-cover img{display:block;height:100%;width:auto;max-width:100%;max-height:100%;object-fit:contain;margin:0 auto;padding:0}
"""
    keep_ids(old, body)
    box = E.SubElement(body, "{%s}div" % X, attrib={"class": "literae-cover"})
    E.SubElement(
        box,
        "{%s}img" % X,
        src=image_href,
        alt=entry["author"] + " – " + entry["title"],
        style="height:100%;width:auto;max-width:100%;margin:0 auto",
    )
    return root


def notice_document(old, entry):
    root, head, body = document("Édition")
    E.SubElement(head, "{%s}style" % X).text = (
        "body{margin:1.5em;line-height:1.6}h1{font-size:1.4em}p{margin:.7em 0}"
    )
    keep_ids(old, body)
    E.SubElement(body, "{%s}h1" % X).text = "Édition"
    for paragraph in entry["notice_paragraphs"]:
        E.SubElement(body, "{%s}p" % X).text = paragraph
    return root


def prepare(source, target, entry, kind, image=None):
    assert source.resolve() != target.resolve()
    with ZipFile(source) as z:
        files = {i.filename: z.read(i) for i in z.infolist()}
    assert not any(
        name in files for name in entry.get("requires_absent_pages", [])
    ), "Apply the source edition repair before replacing its bibliographic notice"
    package = (
        E.fromstring(files["META-INF/container.xml"])
        .find(".//{*}rootfile")
        .get("full-path")
    )
    opf = E.fromstring(files[package])
    assert opf.get("version", "").startswith("3.")
    folder = posixpath.dirname(package)
    manifest = opf.find("o:manifest", NS)
    by_id = {item.get("id"): item for item in manifest}
    first = opf.find("o:spine/o:itemref", NS)
    cover_item = by_id[first.get("idref")]
    cover_path = posixpath.normpath(
        posixpath.join(folder, unquote(cover_item.get("href")))
    )
    assert cover_item.get("media-type") == "application/xhtml+xml"
    original_cover = E.fromstring(files[cover_path])
    # Refuse to overwrite a chapter if an unexpected EPUB was supplied.
    assert original_cover.xpath('//*[local-name()="svg" or local-name()="img"]')
    image_path = posixpath.join(folder, "cover-classic.jpg")
    image_bytes = image or cover_image(entry)
    files[image_path] = image_bytes
    files[cover_path] = xml(
        cover_document(
            original_cover,
            entry,
            posixpath.relpath(image_path, posixpath.dirname(cover_path)),
            kind,
        )
    )
    properties = set(cover_item.get("properties", "").split()) - {"svg"}
    if kind == "web":
        properties.add("svg")
    if properties:
        cover_item.set("properties", " ".join(sorted(properties)))
    else:
        cover_item.attrib.pop("properties", None)
    image_id = "literae-classic-cover"
    assert image_id not in by_id and image_path not in {
        posixpath.join(folder, x.get("href")) for x in manifest
    }
    for item in manifest:
        properties = set(item.get("properties", "").split()) - {"cover-image"}
        if properties:
            item.set("properties", " ".join(sorted(properties)))
        else:
            item.attrib.pop("properties", None)
    E.SubElement(
        manifest,
        "{%s}item" % O,
        id=image_id,
        href="cover-classic.jpg",
        attrib={"media-type": "image/jpeg", "properties": "cover-image"},
    )
    metadata = opf.find("o:metadata", NS)
    cover_meta = metadata.findall('o:meta[@name="cover"]', NS)
    if not cover_meta:
        cover_meta = [E.SubElement(metadata, "{%s}meta" % O, name="cover")]
    for meta in cover_meta:
        meta.set("content", image_id)
    metadata.find('o:meta[@property="dcterms:modified"]', NS).text = datetime.now(
        timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed = {package, cover_path, image_path}
    notices = entry["notice_paths"][kind]
    for name in notices:
        old = E.fromstring(files[name])
        files[name] = xml(notice_document(old, entry))
        changed.add(name)
    removed = set(entry.get("remove_pages", {}).get(kind, []))
    assert cover_path not in removed
    removed_ids = set()
    for item in list(manifest):
        name = posixpath.normpath(posixpath.join(folder, unquote(item.get("href"))))
        if name in removed:
            removed_ids.add(item.get("id"))
            manifest.remove(item)
            files.pop(name)
            changed.add(name)
    spine = opf.find("o:spine", NS)
    for ref in list(spine):
        if ref.get("idref") in removed_ids:
            spine.remove(ref)
    for ref in opf.findall("o:guide/o:reference", NS):
        name = posixpath.normpath(
            posixpath.join(folder, unquote(ref.get("href").split("#")[0]))
        )
        if name in removed:
            ref.set("href", posixpath.relpath(cover_path, folder))
    # Only our editorial notice labels change. Historical prefaces are untouched.
    for item in manifest:
        if (
            "nav" not in item.get("properties", "").split()
            and item.get("media-type") != "application/x-dtbncx+xml"
        ):
            continue
        name = posixpath.normpath(posixpath.join(folder, unquote(item.get("href"))))
        nav = E.fromstring(files[name])
        touched = False
        for link in nav.xpath('//*[local-name()="a"][@href]'):
            dest = posixpath.normpath(
                posixpath.join(
                    posixpath.dirname(name), unquote(link.get("href").split("#")[0])
                )
            )
            if dest in removed:
                li = link.getparent()
                assert E.QName(li).localname == "li" and li.find("x:ol", NS) is None
                li.getparent().remove(li)
                touched = True
                continue
            if dest in notices:
                for child in list(link):
                    link.remove(child)
                link.text = "Édition"
                touched = True
        for point in nav.xpath('//*[local-name()="navPoint"]'):
            content = point.find("{*}content")
            if content is not None:
                dest = posixpath.normpath(
                    posixpath.join(
                        posixpath.dirname(name),
                        unquote(content.get("src").split("#")[0]),
                    )
                )
                if dest in removed:
                    assert point.find("{*}navPoint") is None
                    point.getparent().remove(point)
                    touched = True
                    continue
                if dest in notices:
                    point.find("{*}navLabel/{*}text").text = "Édition"
                    touched = True
        if touched:
            order = {}
            for point in nav.xpath('//*[local-name()="navPoint"]'):
                href = point.find("{*}content").get("src")
                point.set("playOrder", str(order.setdefault(href, len(order) + 1)))
            files[name] = xml(nav)
            changed.add(name)
    files[package] = xml(opf)
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("mimetype", files.pop("mimetype"), compress_type=ZIP_STORED)
        for name, data in files.items():
            z.writestr(name, data)
    with ZipFile(source) as before, ZipFile(target) as after:
        assert all(
            before.read(n) == after.read(n)
            for n in before.namelist()
            if n not in changed
        )
    return {
        "original_sha256": sha256(source.read_bytes()).hexdigest(),
        "corrected_sha256": sha256(target.read_bytes()).hexdigest(),
        "changed_members": sorted(changed),
        "removed_members": sorted(removed),
        "cover_path": cover_path,
        "image_path": image_path,
        "notice_paths": notices,
        "cover_bytes": len(image_bytes),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument(
        "--catalog",
        type=Path,
        default=Path(__file__).with_name("catalogs") / "epub-frontmatter.json",
    )
    parser.add_argument("--book-id", required=True)
    parser.add_argument("--kind", choices=["web", "download"], required=True)
    parser.add_argument("--font", type=Path, default=Path(FONT))
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    entry = next(
        row
        for row in json.loads(args.catalog.read_text())
        if row["book_id"] == args.book_id
    )
    report = prepare(
        args.source, args.target, entry, args.kind, image=cover_image(entry, args.font)
    )
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
