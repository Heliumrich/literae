import { findNoteBibleReferences, type NoteBibleContext, type NoteBibleReference } from './bible-references';
import { referenceText, referenceRange } from './reference-dom';

/** Positioned links leave every original text node, offset and ancestor intact.
 * EPUB.js' automatic CFI mapping does not consistently honour ignoreClass, so
 * wrapping citations in <a> would invalidate existing and newly saved bookmarks.
 */
export function inlineBibleLinks(doc: Document, context: NoteBibleContext, open: (ref: NoteBibleReference, link: HTMLAnchorElement) => void) {
  const map = referenceText(doc.body);
  const entries = findNoteBibleReferences(map.text, context).flatMap(ref => {
    if (!ref.book || map.nodes.some(n => n.start < ref.end && n.end > ref.start && n.node.parentElement?.closest('a[href], button, h1, h2, h3'))) return [];
    return [{ ref, links: [] as HTMLAnchorElement[] }];
  });
  const layer = doc.createElement('div');
  layer.dataset.readerBibleLayer = '';
  layer.style.cssText = 'position:absolute;inset:0 auto auto 0;width:0;height:0;pointer-events:none;';
  doc.body.append(layer);
  let frame = 0;
  const refresh = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!doc.defaultView?.frameElement?.isConnected) return;
      const current = referenceText(doc.body);
      for (const entry of entries) {
        // Changing long-s display can replace CharacterData and reset live Range
        // endpoints. Recreate them from stable source offsets after each reflow.
        const range = referenceRange(current, entry.ref.start, entry.ref.end);
        const rects = range ? [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0) : [];
        while (entry.links.length > rects.length) entry.links.pop()!.remove();
        rects.forEach((rect, index) => {
          let link = entry.links[index];
          if (!link) {
            link = doc.createElement('a'); link.href = '#'; link.className = 'reader-inline-bible';
            link.setAttribute('aria-label', `Lire ${entry.ref.label}`);
            link.dataset.reference = entry.ref.label;
            link.tabIndex = index === 0 ? 0 : -1;
            link.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); open(entry.ref, link); }, true);
            layer.append(link); entry.links.push(link);
          }
          link.style.cssText = `position:absolute;display:block;box-sizing:border-box;pointer-events:auto;background:transparent;border-bottom:1px solid currentColor;text-decoration:none;left:${rect.left + doc.defaultView!.scrollX}px;top:${rect.top + doc.defaultView!.scrollY}px;width:${rect.width}px;height:${rect.height}px;`;
        });
      }
    });
  };
  refresh();
  void doc.fonts?.ready.then(refresh);
  return { refresh };
}
