#!/usr/bin/env python3
"""Repair the reversed title/author in the original Moreau EPUB, without editing text."""

from pathlib import Path
from zipfile import ZipFile
from datetime import datetime, timezone
from lxml import etree as E
import sys


def repair(source, target):
    with ZipFile(source) as z:
        members = z.infolist()
        files = {i.filename: z.read(i) for i in members}
    package = (
        E.fromstring(files["META-INF/container.xml"])
        .find(".//{*}rootfile")
        .get("full-path")
    )
    root = E.fromstring(files[package])
    metadata = root.find("{*}metadata")
    dc = "http://purl.org/dc/elements/1.1/"
    opf = "http://www.idpf.org/2007/opf"
    title, author = metadata.find("{%s}title" % dc), metadata.find("{%s}creator" % dc)
    assert (
        title.text == "Aurelius Augustinus" and author.text == "Confessions"
    ), "Unexpected source metadata"
    title.text, author.text = "Confessions", "Saint Augustin"
    for node, value in [(title, "Confessions"), (author, "Saint Augustin")]:
        for meta in metadata.findall("{%s}meta" % opf):
            if (
                meta.get("refines") == "#" + node.get("id")
                and meta.get("property") == "file-as"
            ):
                meta.text = value
    metadata.find('{%s}meta[@property="dcterms:modified"]' % opf).text = datetime.now(
        timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    files[package] = E.tostring(root, encoding="utf-8", xml_declaration=True)
    changed = {package}
    # Older e-readers may display the NCX document title instead of dc:title.
    for name in files:
        if not name.endswith(".ncx"):
            continue
        ncx = E.fromstring(files[name])
        document_title = ncx.find(".//{*}docTitle/{*}text")
        assert (
            document_title is not None and document_title.text == "Aurelius Augustinus"
        )
        document_title.text = "Confessions"
        files[name] = E.tostring(ncx, encoding="utf-8", xml_declaration=True)
        changed.add(name)
    with ZipFile(target, "w") as z:
        for item in members:
            z.writestr(item, files[item.filename])
    with ZipFile(source) as old, ZipFile(target) as new:
        assert all(
            old.read(n) == new.read(n) for n in old.namelist() if n not in changed
        )
    return sorted(changed)


if __name__ == "__main__":
    repair(*map(Path, sys.argv[1:]))
