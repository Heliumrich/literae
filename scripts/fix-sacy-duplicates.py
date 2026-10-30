#!/usr/bin/env python3
"""Keep the complete Furne Esther/Daniel and order Sacy's 73 books. No CMS access."""

from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
import argparse
import hashlib
import json
import posixpath
import re
from lxml import etree as E

X, O = "http://www.w3.org/1999/xhtml", "http://www.idpf.org/2007/opf"
EP = "http://www.idpf.org/2007/ops"
NS = {"x": X, "o": O, "epub": EP}
OT = [
    *range(3, 19),
    76,
    77,
    75,
    *range(20, 25),
    73,
    74,
    25,
    26,
    27,
    71,
    28,
    72,
    *range(30, 42),
    78,
    79,
]
NT = list(range(43, 70))


def prefix(href):
    match = re.fullmatch(
        r"p(\d{3})-\d{3}\.xhtml", posixpath.basename(href.split("#")[0])
    )
    return int(match[1]) if match else None


def prepare(source, target):
    assert source.resolve() != target.resolve()
    with ZipFile(source) as z:
        files = {n: z.read(n) for n in z.namelist()}
    package = (
        E.fromstring(files["META-INF/container.xml"])
        .find(".//{*}rootfile")
        .get("full-path")
    )
    opf = E.fromstring(files[package])
    assert package == "OPS/content.opf"
    manifest, spine = opf.find("o:manifest", NS), opf.find("o:spine", NS)
    by_id = {item.get("id"): item for item in manifest}
    refs = list(spine)
    groups = {}
    for ref in refs:
        href = by_id[ref.get("idref")].get("href")
        group = prefix(href)
        if group is not None:
            groups.setdefault(group, []).append(ref)
    assert len(groups[19]) == 10 and len(groups[29]) == 12
    assert len(groups[75]) == 16 and len(groups[72]) == 14
    assert len(OT) == 46 and len(NT) == 27
    assert set(groups) == set(OT + NT + [1, 2, 19, 29, 42, 70])
    removed, changed = set(), {package}
    for item in list(manifest):
        if prefix(item.get("href")) in (19, 29, 70):
            name = posixpath.join("OPS", item.get("href"))
            removed.add(name)
            files.pop(name)
            manifest.remove(item)
    # Remove edition suffixes from the retained books, without changing a verse.
    for group, label in [(75, "Esther"), (72, "Daniel")]:
        for ref in groups[group]:
            name = posixpath.join("OPS", by_id[ref.get("idref")].get("href"))
            doc = E.fromstring(files[name])
            verses = [
                E.tostring(v, method="c14n")
                for v in doc.xpath('//x:p[@class="verse"]', namespaces=NS)
            ]
            heading = doc.find('.//x:p[@class="book-label"]', NS)
            assert heading is not None and "Furne 1841" in heading.text
            heading.text = label
            assert verses == [
                E.tostring(v, method="c14n")
                for v in doc.xpath('//x:p[@class="verse"]', namespaces=NS)
            ]
            files[name] = E.tostring(doc, encoding="utf-8", xml_declaration=True)
            changed.add(name)
    leading, trailing = [], []
    for ref in refs:
        if prefix(by_id[ref.get("idref")].get("href")) is None:
            (
                leading if refs.index(ref) < refs.index(groups[3][0]) else trailing
            ).append(ref)
    for ref in list(spine):
        spine.remove(ref)
    for ref in [
        *leading,
        *groups[1],
        *groups[2],
        *(r for group in OT for r in groups[group]),
        *groups[42],
        *(r for group in NT for r in groups[group]),
        *trailing,
    ]:
        spine.append(ref)
    nav_path = "OPS/nav.xhtml"
    nav = E.fromstring(files[nav_path])
    toc = nav.find('.//x:nav[@epub:type="toc"]', NS)
    roots = toc.find("x:ol", NS)
    testaments = roots.findall("x:li/x:ol", NS)
    assert len(testaments) == 3  # front matter, Old Testament, New Testament
    ot_list, nt_list = testaments[1], testaments[2]
    books = {}
    candidates = list(ot_list)
    for li in list(candidates):
        if prefix(li.find("x:a", NS).get("href")) == 70:
            candidates.extend(li.findall("x:ol/x:li", NS))
    for li in candidates:
        a = li.find("x:a", NS)
        if a is not None:
            group = prefix(a.get("href"))
            if group != 70:
                assert group not in books
                books[group] = li
    assert set(books) == set(OT + [19, 29])
    for li in list(ot_list):
        ot_list.remove(li)
    for group in OT:
        li = books[group]
        if group in (75, 72):
            li.find("x:a", NS).text = "Esther" if group == 75 else "Daniel"
        ot_list.append(li)
    assert len(ot_list) == 46 and len(nt_list) == 27
    files[nav_path] = E.tostring(nav, encoding="utf-8", xml_declaration=True)
    changed.add(nav_path)
    for item in manifest:
        if item.get("media-type") != "application/x-dtbncx+xml":
            continue
        name = posixpath.join("OPS", item.get("href"))
        ncx = E.fromstring(files[name])
        navigation = ncx.find("{*}navMap")
        ot_root = next(
            point
            for point in navigation
            if point.find("{*}content").get("src") == "p002-000.xhtml"
        )
        points = {}
        candidates = ot_root.findall("{*}navPoint")
        for point in list(candidates):
            if prefix(point.find("{*}content").get("src")) == 70:
                candidates.extend(point.findall("{*}navPoint"))
        for point in candidates:
            group = prefix(point.find("{*}content").get("src"))
            if group != 70:
                assert group not in points
                points[group] = point
        assert set(points) == set(OT + [19, 29])
        for point in list(ot_root):
            if E.QName(point).localname == "navPoint":
                ot_root.remove(point)
        for group in OT:
            point = points[group]
            if group in (75, 72):
                point.find("{*}navLabel/{*}text").text = (
                    "Esther" if group == 75 else "Daniel"
                )
            ot_root.append(point)
        order = {}
        for point in ncx.findall(".//{*}navPoint"):
            target_href = point.find("{*}content").get("src")
            point.set("playOrder", str(order.setdefault(target_href, len(order) + 1)))
        files[name] = E.tostring(ncx, encoding="utf-8", xml_declaration=True)
        changed.add(name)
    files[package] = E.tostring(opf, encoding="utf-8", xml_declaration=True)
    # Every retained reference must still resolve. Never silently redirect a
    # citation between editions whose verse divisions might differ.
    for name, data in files.items():
        if not name.endswith((".xhtml", ".ncx", ".opf")):
            continue
        root = E.fromstring(data)
        for node in root.xpath("//*[@href or @src]"):
            href = node.get("href") or node.get("src")
            if re.search(r"p(?:019|029|070)-\d{3}\.xhtml", href):
                raise ValueError(
                    "Unresolved reference to a removed edition: " + name + " " + href
                )
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr("mimetype", files.pop("mimetype"), compress_type=ZIP_STORED)
        for name, data in files.items():
            z.writestr(name, data)
    with ZipFile(source) as old, ZipFile(target) as new:
        assert all(
            old.read(n) == new.read(n)
            for n in old.namelist()
            if n not in changed | removed
        )
    return {
        "original_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "corrected_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "changed_members": sorted(changed),
        "removed_members": sorted(removed),
        "old_testament_books": 46,
        "new_testament_books": 27,
        "esther_chapters": 16,
        "daniel_chapters": 14,
        "retained_verses_unchanged": True,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = prepare(args.source, args.target)
    if args.report:
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
