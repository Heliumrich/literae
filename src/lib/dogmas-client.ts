/** Small, local popovers: no reader dependency, network request, or hydrated island. */
export function initDogmaPopovers() {
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const positions: Array<() => void> = [];
  document.querySelectorAll<HTMLElement>('.dogma-item').forEach(item => {
    const button = item.querySelector<HTMLButtonElement>('.dogma-trigger')!;
    const panel = item.querySelector<HTMLElement>('.dogma-popover')!;
    if (item.dataset.bound || typeof panel.showPopover !== 'function') return;
    item.dataset.bound = 'true';
    let pinned = false;
    let timer = 0;
    const isOpen = () => panel.matches(':popover-open');
    const cancel = () => window.clearTimeout(timer);
    function position() {
      if (!isOpen()) return;
      const anchor = button.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      const width = viewport?.width || document.documentElement.clientWidth;
      const height = viewport?.height || innerHeight;
      const gap = 6, margin = 12;
      const x = Math.max(left + margin, Math.min(anchor.left, left + width - bounds.width - margin));
      const below = anchor.bottom + gap;
      const y = below + bounds.height <= top + height - margin ? below : anchor.top - bounds.height - gap;
      panel.style.left = `${x}px`;
      panel.style.top = `${Math.max(top + margin, Math.min(y, top + height - bounds.height - margin))}px`;
    }
    positions.push(position);
    function show(preview: boolean) {
      cancel();
      pinned = !preview;
      panel.toggleAttribute('data-preview', preview);
      panel.showPopover();
      button.setAttribute('aria-expanded', 'true');
      position();
    }
    function leave() {
      cancel();
      if (!pinned) timer = window.setTimeout(() => panel.hidePopover(), 220);
    }
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch' || !hover.matches || pinned) return;
      cancel();
      timer = window.setTimeout(() => show(true), 180);
    });
    button.addEventListener('pointerleave', leave);
    panel.addEventListener('pointerenter', cancel);
    panel.addEventListener('pointerleave', leave);
    button.addEventListener('click', event => {
      event.preventDefault();
      cancel();
      if (isOpen() && pinned) panel.hidePopover();
      else {
        show(false);
        if (event.detail === 0) panel.querySelector<HTMLButtonElement>('.dogma-close')?.focus({ preventScroll: true });
      }
    });
    panel.addEventListener('toggle', () => {
      const open = isOpen();
      button.setAttribute('aria-expanded', String(open));
      if (!open) {
        cancel();
        if (pinned && panel.contains(document.activeElement)) button.focus({ preventScroll: true });
        pinned = false;
        panel.removeAttribute('data-preview');
      }
    });
  });
  if (!positions.length) return;
  let frame = 0;
  const reposition = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; positions.forEach(position => position()); });
  };
  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('scroll', reposition, { passive: true });
  window.visualViewport?.addEventListener('resize', reposition, { passive: true });
}
