/** Offsets address the untouched source text, including references spanning inline tags. */
export function referenceText(root: HTMLElement) {
  let text = '';
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const start = text.length;
      text += (node.textContent || '').replace(/[\r\n]/g, ' ');
      nodes.push({ node: node as Text, start, end: text.length });
    } else {
      const el = node as Element;
      if (el.matches?.('script, style, [data-reader-bible-layer]')) return;
      const block = /^(p|div|li|blockquote|section|aside|tr|br|h[1-6])$/i.test(el.localName || '');
      if (block) text += '\n';
      for (const child of node.childNodes) walk(child);
      if (block) text += '\n';
    }
  };
  walk(root);
  return { text, nodes };
}

export function referenceRange(map: ReturnType<typeof referenceText>, start: number, end: number) {
  const first = map.nodes.find(n => n.start <= start && n.end > start);
  const last = map.nodes.find(n => n.start < end && n.end >= end);
  if (!first || !last) return null;
  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}

/** Remove only a proven editorial prefix from a cloned note, never the reading DOM. */
export function removeNotePrefix(body: HTMLElement, end: number) {
  const map = referenceText(body), start = map.nodes[0]?.start;
  if (start === undefined) return;
  referenceRange(map, start, end)?.deleteContents();
}
