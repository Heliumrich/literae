import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile
from lxml import etree as E

spec = importlib.util.spec_from_file_location('compact', Path(__file__).parents[2] / 'scripts/compact-download-epub.py')
compact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compact)


class CompactDownload(unittest.TestCase):
    def test_preserves_words_links_punctuation_and_note_targets(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            source, target = root / 'source.epub', root / 'compact.epub'
            doc = f'''<html xmlns="{compact.X}" xmlns:epub="{compact.EP}"><head/><body>
<p>Un <em>mot</em> <a id="appel"/><a epub:type="noteref" role="doc-noteref" href="#note">1</a>. Suite.</p>
<aside epub:type="footnote" role="doc-footnote"><p><a id="note"/><a role="doc-backlink" href="#appel">[1]</a> Jn 1:1.</p></aside>
</body></html>'''
            with ZipFile(source, 'w') as z:
                z.writestr('mimetype', 'application/epub+zip')
                z.writestr('META-INF/container.xml', '<container><rootfile full-path="package.opf"/></container>')
                z.writestr('package.opf', '<package><metadata><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata></package>')
                z.writestr('style.css', 'p {margin:.7em 0}')
                z.writestr('chapter.xhtml', doc)
            result = compact.compact(source, target, 'style.css')
            self.assertEqual((result['calls'], result['notes']), (1, 1))
            with ZipFile(target) as z:
                tree = E.fromstring(z.read('chapter.xhtml'))
                call = tree.xpath('//x:a[@epub:type="noteref"]', namespaces=compact.NS)[0]
                self.assertEqual(call.getparent().tag, f'{{{compact.X}}}sup')
                self.assertEqual(call.getparent().getprevious().tail, '\u00a0')
                self.assertEqual(call.getparent().tail, '. Suite.')
                self.assertEqual(call.get('href'), '#note')
                self.assertEqual(tree.xpath('//@id'), ['appel', 'note'])
                self.assertIn('ebook-note', tree.find('.//{%s}aside' % compact.X).get('class'))
                self.assertIn('margin-top: 0; margin-bottom: 0', z.read('style.css').decode())
            with self.assertRaisesRegex(ValueError, 'already compacted'):
                compact.compact(target, root / 'second.epub', 'style.css')
