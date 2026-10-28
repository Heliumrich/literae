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
