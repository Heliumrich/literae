import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from zipfile import ZipFile
from lxml import etree as E

spec = importlib.util.spec_from_file_location(
    "prepare", Path(__file__).parents[2] / "scripts/prepare-reader-epub.py"
)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
X, EP = prepare.X, prepare.EPUB


class Punctuation(TestCase):
    def test_inline_boundaries_and_markup(self):
        root = E.fromstring(
            f'<html xmlns="{X}"><body><p href="a : b">Voici <em>le mot </em><strong>!</strong> Texte\n ; oui ? non ! <em>mot</em> : suite!</p><p>Autre bloc</p></body></html>'
        )
        self.assertEqual(prepare.punctuation(root), 5)
        self.assertEqual(
            "".join(root.find(".//{%s}p" % X).itertext()),
            "Voici le mot\u00a0! Texte\u00a0; oui\u00a0? non\u00a0! mot\u00a0: suite!",
        )
        self.assertEqual(root.find(".//{%s}p" % X).get("href"), "a : b")
        self.assertEqual(prepare.punctuation(root), 0)

    def test_code_and_style_remain_unchanged(self):
        root = E.fromstring(
            f'<html xmlns="{X}"><head><style>a : b !</style></head><body><pre>a : b !</pre><p>Texte !</p></body></html>'
        )
        self.assertEqual(prepare.punctuation(root), 1)
        self.assertEqual(root.find(".//{%s}style" % X).text, "a : b !")
        self.assertEqual(root.find(".//{%s}pre" % X).text, "a : b !")


class Notes(TestCase):
    def make(self, directory):
        source = directory / "source.epub"
        files = {
            "mimetype": "application/epub+zip",
            "META-INF/container.xml": '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf"/></rootfiles></container>',
            "EPUB/package.opf": f'<package xmlns="{prepare.OPF}" version="3.0"><metadata/><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/><itemref idref="notes"/></spine></package>',
            "EPUB/one.xhtml": f'<html xmlns="{X}" xmlns:epub="{EP}" lang="fr"><head><title>Premier</title></head><body><p id="back-one">Texte !<a href="notes.xhtml#inside">1</a></p><aside epub:type="footnote" id="inline"><p>Note locale.</p></aside><p>Suite<a href="#inline">2</a></p></body></html>',
            "EPUB/two.xhtml": f'<html xmlns="{X}" xmlns:epub="{EP}"><head><title>Second</title></head><body><p>Autre<a href="notes.xhtml#end">1</a></p></body></html>',
            "EPUB/notes.xhtml": f'<html xmlns="{X}" xmlns:epub="{EP}"><head><title>Notes</title></head><body><h2>Notes</h2><ol><li id="end" epub:type="footnote"><p id="inside">Une note !<em> Important.</em><a role="doc-backlink" href="one.xhtml#back-one">Retour</a></p></li></ol></body></html>',
            "EPUB/nav.xhtml": f'<html xmlns="{X}" xmlns:epub="{EP}"><head><title>Sommaire</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Premier</a></li><li><a href="two.xhtml">Second</a></li><li><a href="notes.xhtml">Notes</a></li></ol></nav></body></html>',
        }
        with ZipFile(source, "w") as z:
            for name, value in files.items():
                z.writestr(name, value)
        return source

    def test_untyped_wikisource_note_keeps_entire_list_item(self):
        with TemporaryDirectory() as temp:
            directory = Path(temp)
            source = self.make(directory)
            with ZipFile(source) as archive:
                files = {name: archive.read(name) for name in archive.namelist()}
            doc = E.fromstring(files["EPUB/notes.xhtml"])
            note = doc.find(".//{%s}li" % X)
            note.attrib.clear()
            marker = E.Element("{%s}span" % X, id="cite_note-1")
            note.insert(0, marker)
            files["EPUB/notes.xhtml"] = E.tostring(doc)
            for name in ["EPUB/one.xhtml", "EPUB/two.xhtml"]:
                files[name] = (
                    files[name]
                    .replace(b"notes.xhtml#inside", b"notes.xhtml#cite_note-1")
                    .replace(b"notes.xhtml#end", b"notes.xhtml#cite_note-1")
                )
            with ZipFile(source, "w") as archive:
                for name, content in files.items():
                    archive.writestr(name, content)
            web = directory / "web.epub"
            report = prepare.prepare(source, web)
            self.assertEqual(report["notes"], 2)
            with ZipFile(web) as archive:
                first = E.fromstring(archive.read("EPUB/one.xhtml"))
                link = first.find('.//x:a[@role="doc-noteref"]', prepare.NS)
                path, ident = prepare.resolve(link.get("href"), "EPUB/one.xhtml")
                notes = E.fromstring(archive.read(path))
                target = notes.xpath(
                    "//*[@id=$id]/ancestor-or-self::x:aside[1]",
                    namespaces=prepare.NS,
                    id=ident,
                )[0]
                self.assertIn("Une note\u00a0!", "".join(target.itertext()))
                self.assertIn("Important.", "".join(target.itertext()))

    def test_orphan_notes_are_rejected(self):
        with TemporaryDirectory() as temp:
            directory = Path(temp)
            source = self.make(directory)
            with ZipFile(source) as z:
                files = {name: z.read(name) for name in z.namelist()}
            doc = E.fromstring(files["EPUB/one.xhtml"])
            body = doc.find("{%s}body" % X)
            note = E.SubElement(body, "{%s}aside" % X, id="orphan")
            note.set("{%s}type" % EP, "footnote")
            note.text = "Unlinked"
            files["EPUB/one.xhtml"] = E.tostring(doc)
            with ZipFile(source, "w") as z:
                for name, value in files.items():
                    z.writestr(name, value)
            with self.assertRaisesRegex(ValueError, "no reference"):
                prepare.prepare(source, directory / "web.epub")

    def test_local_preloads_copies_and_original_download(self):
        with TemporaryDirectory() as temp:
            directory = Path(temp)
            source = self.make(directory)
            web = directory / "web.epub"
            dl = directory / "download.epub"
            report = prepare.prepare(source, web, dl)
            self.assertEqual(report["notes"], 2)
            self.assertEqual(report["noteCopies"], 3)
            self.assertEqual(report["references"], 3)
            self.assertEqual(report["unreferenced"], 0)
            self.assertEqual(report["hiddenOriginals"], ["EPUB/notes.xhtml"])
            self.assertEqual(len(report["sourceLinks"]["EPUB/one.xhtml"]), 1)
            self.assertEqual(len(report["sourceLinks"]["EPUB/two.xhtml"]), 1)
            with ZipFile(web) as z:
                self.assertNotIn("EPUB/notes.xhtml", z.namelist())
                opf = E.fromstring(z.read("EPUB/package.opf"))
                self.assertEqual(
                    len(opf.findall('.//o:itemref[@linear="no"]', prepare.NS)), 2
                )
                for name in ["EPUB/one.xhtml", "EPUB/two.xhtml"]:
                    doc = E.fromstring(z.read(name))
                    self.assertFalse(any(prepare.is_note(n) for n in doc.iter()))
                    self.assertTrue(
                        doc.findall('.//x:link[@rel="literae-notes"]', prepare.NS)
                    )
                    for a in doc.findall('.//x:a[@role="doc-noteref"]', prepare.NS):
                        dest, ident = prepare.resolve(a.get("href"), name)
                        note = E.fromstring(z.read(dest))
                        self.assertTrue(note.xpath("//*[@id=$id]", id=ident))
                nav = E.fromstring(z.read("EPUB/nav.xhtml"))
                self.assertNotIn("Notes", "".join(nav.itertext()))
            with ZipFile(dl) as z:
                self.assertIn("EPUB/notes.xhtml", z.namelist())
                self.assertFalse(
                    any("/literae-notes/" in name for name in z.namelist())
                )
                self.assertIn("Texte\u00a0!", z.read("EPUB/one.xhtml").decode())
                self.assertIn("Une note\u00a0!", z.read("EPUB/notes.xhtml").decode())
            self.assertTrue(source.exists())


if __name__ == "__main__":
    main()
