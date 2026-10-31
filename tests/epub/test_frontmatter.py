import importlib.util
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from zipfile import ZipFile

from lxml import etree as E
from PIL import Image

spec = importlib.util.spec_from_file_location(
    "frontmatter", Path(__file__).parents[2] / "scripts/prepare-epub-frontmatter.py"
)
fm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fm)


class Frontmatter(TestCase):
    def test_raster_cover_has_a_real_border_and_baseline_jpeg(self):
        image = fm.cover_image(self.entry())
        with Image.open(BytesIO(image)) as im:
            self.assertEqual(im.format, "JPEG")
            self.assertEqual(im.size, (1200, 1680))
            self.assertFalse(im.info.get("progressive"))
            # The frame is in the pixels, independent of EPUB CSS/SVG support.
            self.assertLess(sum(im.getpixel((58, 58))), sum(im.getpixel((20, 20))))

    def entry(self):
        return dict(
            title="Pensées",
            author="Blaise Pascal",
            origin_label="Première publication",
            origin_date="1670",
            publisher="Paris, Guillaume Desprez",
            edition_date="1670",
            notice_paragraphs=[
                "Première publication\u00a0: 1670.",
                "Paris, Guillaume Desprez, 1670.",
            ],
            notice_paths={"web": ["EPUB/foreword.xhtml"]},
        )

    def test_replacement_keeps_chapters_notes_author_and_fragments(self):
        with TemporaryDirectory() as directory:
            source, target = (
                Path(directory) / "source.epub",
                Path(directory) / "target.epub",
            )
            files = {
                "mimetype": b"application/epub+zip",
                "META-INF/container.xml": b'<container><rootfiles><rootfile full-path="EPUB/book.opf"/></rootfiles></container>',
                "EPUB/book.opf": f"""<package xmlns="{fm.O}" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Pensées</dc:title><dc:creator>Blaise Pascal</dc:creator><meta property="dcterms:modified">2020-01-01T00:00:00Z</meta></metadata><manifest><item id="cover" href="titlepage.xhtml" media-type="application/xhtml+xml" properties="svg"/><item id="notice" href="foreword.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="cover"/><itemref idref="notice"/><itemref idref="chapter"/><itemref idref="notes" linear="no"/></spine></package>""".encode(),
                "EPUB/titlepage.xhtml": f'<html xmlns="{fm.X}"><head/><body id="cover"><svg xmlns="http://www.w3.org/2000/svg"><text>Pascal</text></svg></body></html>'.encode(),
                "EPUB/foreword.xhtml": f'<html xmlns="{fm.X}"><head/><body><h2 id="avis">Avis au lecteur</h2><p>Présentation technique Literae.</p></body></html>'.encode(),
                "EPUB/chapter.xhtml": "<p>Le cœur a ses raisons.</p>".encode(),
                "EPUB/notes.xhtml": b'<aside id="note1">Commentaire.</aside>',
            }
            with ZipFile(source, "w") as archive:
                for name, data in files.items():
                    archive.writestr(name, data)
            fm.prepare(source, target, self.entry(), "web")
            with ZipFile(target) as archive:
                for name in ["EPUB/chapter.xhtml", "EPUB/notes.xhtml"]:
                    self.assertEqual(archive.read(name), files[name])
                notice = E.fromstring(archive.read("EPUB/foreword.xhtml"))
                self.assertTrue(notice.xpath('//*[@id="avis"]'))
                self.assertNotIn("Literae", "".join(notice.itertext()))
                cover = E.fromstring(archive.read("EPUB/titlepage.xhtml"))
                self.assertTrue(cover.xpath('//*[local-name()="svg"]'))
                self.assertIsNone(cover.find(".//x:img", fm.NS))
                self.assertIn("svg", E.fromstring(archive.read("EPUB/book.opf")).find('o:manifest/o:item[@id="cover"]', fm.NS).get("properties").split())
                opf = E.fromstring(archive.read("EPUB/book.opf"))
                self.assertEqual(
                    opf.find(".//{http://purl.org/dc/elements/1.1/}creator").text,
                    "Blaise Pascal",
                )
                self.assertEqual(
                    opf.find('o:metadata/o:meta[@name="cover"]', fm.NS).get("content"),
                    "literae-classic-cover",
                )

    def test_download_cover_remains_a_single_raster_image(self):
        old = E.fromstring(f'<html xmlns="{fm.X}"><body/></html>')
        cover = fm.cover_document(old, self.entry(), "cover.jpg", "download")
        self.assertFalse(cover.xpath('//*[local-name()="svg"]'))
        self.assertEqual(cover.find(".//x:img", fm.NS).get("src"), "cover.jpg")
