#!/usr/bin/env python3
"""Set an EPUB 3 author and file-as value without changing its reading content."""

import argparse
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as E


def update(source, target, author, sort_name):
    assert source.resolve() != target.resolve()
    with ZipFile(source) as z:
        entries = z.infolist()
        files = {i.filename: z.read(i) for i in entries}
    package = (
        E.fromstring(files["META-INF/container.xml"])
        .find(".//{*}rootfile")
        .get("full-path")
    )
    root = E.fromstring(files[package])
    assert root.get("version", "").startswith("3.")
    metadata = root.find("{*}metadata")
    creators = metadata.findall("{http://purl.org/dc/elements/1.1/}creator")
    assert len(creators) == 1, "Review multiple authors before changing metadata"
    creator = creators[0]
    creator.text = author
    identity = creator.get("id")
    if not identity:
        identity = "literae-author"
        assert not root.xpath("//*[@id=$id]", id=identity)
        creator.set("id", identity)
    opf = "http://www.idpf.org/2007/opf"
    refinements = metadata.findall(
        '{%s}meta[@refines="#%s"][@property="file-as"]' % (opf, identity)
    )
    if not refinements:
        refinements = [
            E.SubElement(
                metadata, "{%s}meta" % opf, refines="#" + identity, property="file-as"
            )
        ]
    for refinement in refinements:
        refinement.text = sort_name
    creator.attrib.pop("{%s}file-as" % opf, None)
    for meta in metadata.findall("{%s}meta" % opf):
        if meta.get("name") == "calibre:author_sort":
            meta.set("content", sort_name)
    metadata.find('{%s}meta[@property="dcterms:modified"]' % opf).text = datetime.now(
        timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    files[package] = E.tostring(root, encoding="utf-8", xml_declaration=True)
    with ZipFile(target, "w") as z:
        for item in entries:
            z.writestr(item, files[item.filename])
    with ZipFile(source) as old, ZipFile(target) as new:
        assert all(old.read(n) == new.read(n) for n in old.namelist() if n != package)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--author", required=True)
    parser.add_argument("--sort-name", required=True)
    args = parser.parse_args()
    update(args.source, args.target, args.author, args.sort_name)
