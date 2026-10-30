import importlib.util
from pathlib import Path
from unittest import TestCase
from lxml import etree as E

spec = importlib.util.spec_from_file_location(
    "library", Path(__file__).parents[2] / "scripts/prepare-library-epubs.py"
)
lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lib)


class LibraryMarkup(TestCase):
    def test_image_format_does_not_depend_on_wikimedia_query_filename(self):
        self.assertEqual(
            lib.image_extension(b"\xff\xd8\xff", "image.org_utm_content_thumbnail"),
            ".jpg",
        )
        self.assertEqual(lib.image_extension(b"\x89PNG\r\n", "thumbnail"), ".png")

    def test_wikisource_root_keeps_original_epigraph_without_repeating_toc(self):
        body = E.fromstring(
            f'<body xmlns="{lib.X}"><section><p>Pro defunctis.</p>'
            '<div class="ws-summary"><p>TABLE DES MATIÈRES</p>'
            '<a href="chapter.xhtml">Chapitre premier</a></div></section></body>'
        )
        selected = lib.select(
            {"key": "new-book", "source_profile": "wikisource"},
            "OPS/c0_book.xhtml",
            body,
            1,
            5,
        )
        self.assertEqual(lib.text(selected[0]), "Pro defunctis.")
        self.assertIn("TABLE DES MATIÈRES", lib.text(body))

    def test_heading_block_boundaries_do_not_join_words(self):
        body = E.fromstring(
            f'<body xmlns="{lib.X}"><h2>INTRODUCTION<div>ET</div>PRÉLIMINAIRES AVEUX</h2></body>'
        )
        lib.clean(body, "new-book", "source.xhtml")
        self.assertEqual(
            " ".join("".join(body.itertext()).split()),
            "INTRODUCTION ET PRÉLIMINAIRES AVEUX",
        )

    def test_wiki_indentation_becomes_valid_blockquote(self):
        body = E.fromstring(
            f'<body xmlns="{lib.X}"><dl><dd>Première ligne.</dd><dd>Seconde ligne.</dd></dl></body>'
        )
        selected = lib.select(
            {"key": "new-book", "source_profile": "wikisource"},
            "OPS/chapter.xhtml",
            body,
            2,
            5,
        )[0]
        self.assertIsNotNone(selected.find("x:blockquote/x:div", lib.NS))
        self.assertEqual(lib.text(selected), "Première ligne. Seconde ligne.")

    def test_old_xhtml_entities_preserve_punctuation_and_apostrophes(self):
        doc = lib.parse(b"<p>l&rsquo;homme&nbsp;: oui&thinsp;!</p>")
        self.assertEqual(doc.text, "l’homme\u00a0: oui\u2009!")

    def test_list_notes_keep_valid_list_semantics(self):
        root = E.fromstring(
            f'<body xmlns="{lib.X}"><ol><li id="cite_note-1"><span>Note<div>Autre paragraphe.</div></span></li></ol></body>'
        )
        lib.clean(root, "maistre", "source.xhtml")
        note = root.find(".//{%s}li" % lib.X)
        self.assertEqual(note.get("{%s}type" % lib.EP), "footnote")
        self.assertIsNone(note.get("role"))
        self.assertEqual(lib.local(note[0]), "div")
        self.assertIn("Autre paragraphe.", "".join(note.itertext()))

    def test_flattening_keeps_direct_links_and_anchor_ids(self):
        doc = E.fromstring(
            f'<body xmlns="{lib.X}"><div id="part">Texte<a href="chapter.xhtml#target">Lire</a> suite.</div></body>'
        )
        blocks = list(lib.blocks_of(doc))
        self.assertEqual(
            "".join("".join(n.itertext()) for n in blocks), "TexteLire suite."
        )
        self.assertEqual(blocks[0].get("id"), "part")
        self.assertTrue(
            any(
                lib.local(n) == "a" and n.get("href") == "chapter.xhtml#target"
                for n in blocks
            )
        )
