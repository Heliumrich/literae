/** Mouse-only, scrollable preview. A delayed exit bridges the iframe boundary. */
export class NotePreview {
  readonly element = document.createElement('div');
  private timer = 0;
  private exit = 0;
  private generation = 0;
  private anchor: HTMLElement | null = null;
  constructor(root: HTMLElement, private cancel: () => void) {
    this.element.className = 'reader-note-preview reader-note-body';
    this.element.setAttribute('popover', 'manual');
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Aperçu de la note');
    if (typeof this.element.showPopover !== 'function') this.element.hidden = true;
    root.append(this.element);
    this.element.addEventListener('pointerenter', () => clearTimeout(this.exit));
    this.element.addEventListener('pointerleave', () => this.leave());
    this.element.addEventListener('keydown', event => { if (event.key === 'Escape') this.close(); });
    document.addEventListener('pointerdown', this.dismiss, true);
    window.addEventListener('resize', this.dismiss);
    window.addEventListener('scroll', this.dismiss, true);
    document.addEventListener('keydown', this.escape);
  }
  private escape = (event: KeyboardEvent) => { if (event.key === 'Escape') this.close(); };
  private dismiss = (event: Event) => {
    if (!(event.target instanceof Node) || !this.element.contains(event.target)) this.close();
  };
  enter(event: PointerEvent, anchor: HTMLElement, render: (body: HTMLElement, current: () => boolean) => Promise<void> | void) {
    if (typeof this.element.showPopover !== 'function' || event.pointerType !== 'mouse' || !matchMedia('(any-hover: hover) and (any-pointer: fine)').matches) return;
    clearTimeout(this.exit);
    if (this.anchor === anchor) return;
    this.close();
    this.anchor = anchor;
    const generation = this.generation;
    this.timer = window.setTimeout(() => {
      if (!anchor.isConnected) return this.close();
      this.element.textContent = 'Chargement de la note…';
      this.element.showPopover();
      const rect = anchor.getBoundingClientRect();
      const frame = anchor.ownerDocument.defaultView?.frameElement?.getBoundingClientRect();
      const left = rect.left + (frame?.left || 0), top = rect.top + (frame?.top || 0);
      const bottom = rect.bottom + (frame?.top || 0);
      const below = window.innerHeight - bottom > top;
      const available = below ? window.innerHeight - bottom - 12 : top - 12;
      this.element.style.maxHeight = `${Math.max(60, Math.min(available, window.innerHeight * .6, 420))}px`;
      this.element.style.left = `${Math.max(8, Math.min(left - 6, window.innerWidth - this.element.offsetWidth - 8))}px`;
      this.element.style.top = below ? `${bottom - 2}px` : 'auto';
      this.element.style.bottom = below ? 'auto' : `${window.innerHeight - top - 2}px`;
      void render(this.element, () => generation === this.generation);
    }, 250);
  }
  leave() { clearTimeout(this.exit); this.exit = window.setTimeout(() => this.close(), 220); }
  close() {
    clearTimeout(this.timer); clearTimeout(this.exit); this.generation++;
    if (this.anchor) this.cancel();
    this.anchor = null;
    if (typeof this.element.hidePopover === 'function' && this.element.matches(':popover-open')) this.element.hidePopover();
  }
  destroy() {
    this.close(); this.element.remove();
    document.removeEventListener('pointerdown', this.dismiss, true);
    window.removeEventListener('resize', this.dismiss);
    window.removeEventListener('scroll', this.dismiss, true);
    document.removeEventListener('keydown', this.escape);
  }
}
