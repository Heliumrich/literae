/** Display-only substitution: one character stays one character, preserving CFI offsets. */
export const modernizeText = (text: string, enabled: boolean): string =>
  enabled ? text.replaceAll('ſ', 's') : text;
const originals = new WeakMap<Text, string>();

/** Keep the source text so switching the option off is lossless, including after reflow. */
export function modernizeDocument(doc: Document, enabled: boolean) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    if (node.parentElement?.closest('script, style')) continue;
    if (!originals.has(node) && node.data.includes('ſ'))
      originals.set(node, node.data);
    const original = originals.get(node);
    if (original !== undefined) node.data = modernizeText(original, enabled);
  }
}
