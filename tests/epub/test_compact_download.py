import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import re
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
            doc = f'''<html xmlns="{compact.X}" xmlns:epub="{compact.EP}"><head><style>p {{margin:2em}} body {{line-height:2}}</style></head><body>
<p style="margin-top:2em">Un <em>mot</em> <a id="appel"/><a epub:type="noteref" role="doc-noteref" href="#note">1</a>. Suite.</p>
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
                css = re.sub(r'/\*.*?\*/', '', z.read('style.css').decode(), flags=re.S)
                selectors = {part.split('{')[0].strip() for part in css.split('}') if '{' in part}
                self.assertEqual(selectors, {'aside.ebook-note', 'aside.ebook-note p', 'sup.ebook-noteref'})
                self.assertFalse(tree.xpath('//x:style | //*[@style]', namespaces=compact.NS))
            second = root / 'second.epub'
            compact.compact(target, second, 'style.css')
            with ZipFile(target) as first, ZipFile(second) as repeated:
                self.assertEqual(first.read('chapter.xhtml'), repeated.read('chapter.xhtml'))
                self.assertEqual(first.read('style.css'), repeated.read('style.css'))

            half = root / 'half.epub'
            compact.compact(target, half, 'style.css', .5)
            with ZipFile(target) as defaults, ZipFile(half) as custom:
                self.assertEqual(defaults.read('chapter.xhtml'), custom.read('chapter.xhtml'))
                self.assertEqual(custom.read('style.css').decode(), 'p { margin: 0.5em 0; }\n' + defaults.read('style.css').decode())
            with self.assertRaises(ValueError):
                compact.compact(target, root / 'invalid.epub', 'style.css', -.5)
