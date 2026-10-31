#!/usr/bin/env python3
"""Restore the vector title page of a web edition without changing its text or notes."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import posixpath
from urllib.parse import unquote
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED

from lxml import etree as E

spec = importlib.util.spec_from_file_location("frontmatter", Path(__file__).with_name("prepare-epub-frontmatter.py"))
fm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fm)


def restore(source, target, entry):
    assert source.resolve() != target.resolve()
    with ZipFile(source) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
    package = E.fromstring(files["META-INF/container.xml"]).find(".//{*}rootfile").get("full-path")
    opf = E.fromstring(files[package])
    first = opf.find("o:spine/o:itemref", fm.NS).get("idref")
    item = opf.find(f'o:manifest/o:item[@id="{first}"]', fm.NS)
    assert item.get("media-type") == "application/xhtml+xml"
    cover = posixpath.normpath(posixpath.join(posixpath.dirname(package), unquote(item.get("href"))))
    old = E.fromstring(files[cover])
    assert old.xpath('//*[local-name()="svg" or local-name()="img"]')
    files[cover] = fm.xml(fm.cover_document(old, entry, "", "web"))
    item.set("properties", " ".join(sorted(set(item.get("properties", "").split()) | {"svg"})))
    opf.find('o:metadata/o:meta[@property="dcterms:modified"]', fm.NS).text = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    files[package] = fm.xml(opf)
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("mimetype", files.pop("mimetype"), compress_type=ZIP_STORED)
        for name, content in files.items():
            archive.writestr(name, content)
    with ZipFile(source) as before, ZipFile(target) as after:
        assert set(before.namelist()) == set(after.namelist())
        assert all(before.read(name) == after.read(name) for name in before.namelist() if name not in (cover, package))
    return {"changed_members": [cover, package], "cover_path": cover}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--book-id", required=True)
    parser.add_argument("--catalog", type=Path, default=Path(__file__).parent / "catalogs/epub-frontmatter.json")
    args = parser.parse_args()
    entry = next(row for row in json.loads(args.catalog.read_text()) if row["book_id"] == args.book_id)
    print(json.dumps(restore(args.source, args.target, entry), ensure_ascii=False))
