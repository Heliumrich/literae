/** Zoom and pan in CSS pixels. 100% means one image pixel per CSS pixel. */
export function createLightboxZoom(
  stage: HTMLElement,
  image: HTMLImageElement,
  label: HTMLElement,
  requestOriginal: () => boolean,
) {
  let width = 0, x = 0, y = 0;
  let fitted = true;
  let frame = 0;
  let suppressClickUntil = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { distance: number; width: number; x: number; y: number; cx: number; cy: number } | null = null;
  const fitWidth = () => Math.min(image.naturalWidth, stage.clientWidth, stage.clientHeight * image.naturalWidth / image.naturalHeight);

  function paint() {
    frame = 0;
    if (!image.naturalWidth || !width) return;
    const height = width * image.naturalHeight / image.naturalWidth;
    const limitX = Math.max(0, (width - stage.clientWidth) / 2);
    const limitY = Math.max(0, (height - stage.clientHeight) / 2);
    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    stage.classList.toggle('is-zoomed', width > fitWidth() + 1);
    label.textContent = `${Math.round(width / image.naturalWidth * 100)} %`;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }

  function zoomTo(next: number, clientX?: number, clientY?: number) {
    if (!width || !image.naturalWidth) return;
    const native = image.naturalWidth;
    let upgrade = false;
    // Reach 100% first; a further deliberate gesture upgrades only this work.
    if (next > native && width < native - 1) next = native;
    else if (next > native) upgrade = true;
    next = Math.max(fitWidth(), Math.min(native * 4, next));
    const rect = stage.getBoundingClientRect();
    const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
    const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
    const ratio = next / width;
    x = anchorX - (anchorX - x) * ratio;
    y = anchorY - (anchorY - y) * ratio;
    width = next;
    fitted = width <= fitWidth() + 1;
    schedule();
    if (upgrade) requestOriginal();
  }
  function zoomBy(factor: number, cx?: number, cy?: number) { zoomTo(width * factor, cx, cy); }
  function loaded() {
    if (!image.naturalWidth) return;
    if (fitted || !width) { width = fitWidth(); x = y = 0; }
    paint();
  }
  function reset() {
    width = x = y = 0;
    fitted = true;
    pointers.clear(); gesture = null;
    image.style.removeProperty('width'); image.style.removeProperty('height'); image.style.removeProperty('transform');
    label.textContent = '–';
    stage.classList.remove('is-zoomed');
  }
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    zoomBy(Math.exp(-Math.max(-100, Math.min(100, pixels)) * .003), event.clientX, event.clientY);
  }, { passive: false });
  const center = () => {
    const points = [...pointers.values()];
    const a = points[0], b = points[1] || a;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  function startGesture() {
    gesture = pointers.size ? { ...center(), width, x, y } : null;
  }
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    startGesture();
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = center();
    const dx = current.cx - gesture.cx, dy = current.cy - gesture.cy;
    if (pointers.size > 1 && gesture.distance > 0) {
      zoomTo(gesture.width * current.distance / gesture.distance, current.cx, current.cy);
      suppressClickUntil = performance.now() + 400;
    } else {
      x = gesture.x + dx; y = gesture.y + dy;
      if (Math.hypot(dx, dy) > 4) suppressClickUntil = performance.now() + 400;
      schedule();
    }
  });
  function endGesture(event: PointerEvent) { pointers.delete(event.pointerId); startGesture(); }
  stage.addEventListener('pointerup', endGesture);
  stage.addEventListener('pointercancel', endGesture);
  stage.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  image.draggable = false;
  new ResizeObserver(() => { if (fitted) loaded(); else schedule(); }).observe(stage);
  return { zoomBy, loaded, reset };
}
