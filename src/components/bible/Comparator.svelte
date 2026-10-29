<script lang="ts">
  import { onMount } from 'svelte';
  import { formatRefLabel, parseReference } from '../../lib/bible-ref';
  import { restoreTranslationIds, type BibleTranslation } from '../../lib/bible-translations';
  import { getBibleNavigation, type BibleCatalogBook } from '../../lib/bible-navigation';
  import OfflinePanel from './OfflinePanel.svelte';
  import { readComparatorPassage, OfflineBibleRequiredError } from '../../lib/offline/passage';
  import type { OfflineBible } from '../../lib/offline/types';
  import PassagePicker from './PassagePicker.svelte';

  type Translation = BibleTranslation;
  type Verse = { verse: number; text: string };
  type Column = { code: string; name: string; verses: Verse[]; meta?: Translation };
  type NavTarget = { book: string; chapter: number; verse?: number | null };
  type Navigation = { prev: NavTarget | null; next: NavTarget | null };

  export let offlineBible: OfflineBible;
  export let initialTranslations: Translation[] = [];
  export let initialNavigationBooks: BibleCatalogBook[] = [];

  let translations: Translation[] = initialTranslations;
  let ref = 'Jean 3:16';
  let numCols = 2;
  let selectedIds: number[] = [];
  let align = true;
  let textScale = 1;
  let compactLayout = false;
  let loading = false;
  let error = '';
  let columns: Column[] = [];
  let current = { book: '', chapter: 0, verse: null as number | null, verseEnd: null as number | null };
  let nav: Navigation = { prev: null, next: null };
  let ready = false;
  let highlightedVerse: number | null = null;
  let loadVersion = 0;

  // Shared grid tracks align the headers and, optionally, each verse. Include
  // missing verse numbers so that a gap in one edition cannot shift the rest.
  $: verseNumbers = [...new Set(columns.flatMap(column => column.verses.map(verse => verse.verse)))].sort((a, b) => a - b);
  $: readingColumns = columns.map(column => {
    const byNumber = new Map(column.verses.map(verse => [verse.verse, verse]));
    return {
      ...column,
      verses: align
        ? verseNumbers.map(verse => byNumber.get(verse) ?? { verse, text: '' })
        : column.verses,
    };
  });

  onMount(() => {
    const compactScreen = window.matchMedia('(max-width: 1000px), (pointer: coarse) and (max-height: 600px)');
    const updateCompactLayout = () => { compactLayout = compactScreen.matches; };
    updateCompactLayout();
    compactScreen.addEventListener('change', updateCompactLayout);
    return () => compactScreen.removeEventListener('change', updateCompactLayout);
  });

  onMount(async () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('bible-comparator'); } catch {}
    if (saved) {
      try {
        const data = JSON.parse(saved);
        ref = data.ref ?? ref;
        numCols = Math.min(4, Math.max(1, data.numCols ?? 2));
        selectedIds = restoreTranslationIds(data, translations);
        align = data.align ?? true;
        if (typeof data.textScale === 'number' && Number.isFinite(data.textScale)) {
          textScale = Math.min(1.6, Math.max(0.7, data.textScale));
        }
      } catch {}
    }
    const linkedRef = new URLSearchParams(window.location.search).get('ref');
    if (linkedRef?.trim()) ref = linkedRef.trim();

    if (!translations.length) {
      error = 'La liste des traductions n’a pas pu être chargée.';
      return;
    }

    selectedIds = selectedIds
      .filter((id) => translations.some((translation) => translation.id === id))
      .slice(0, numCols);
    fillSelectedIds();

    ready = true;
    await load();
  });

  function fillSelectedIds() {
    while (selectedIds.length < numCols) {
      const next =
        translations.find((translation) => !selectedIds.includes(translation.id)) ||
        translations[0];
      if (!next) break;
      selectedIds.push(next.id);
    }
    selectedIds = [...selectedIds.slice(0, numCols)];
  }

  function savePrefs() {
    if (!ready) return;
    try { localStorage.setItem('bible-comparator', JSON.stringify({
      ref, numCols, selectedIds,
      selectedCodes: selectedIds.map(id => translations.find(translation => translation.id === id)?.code),
      align, textScale
    })); } catch {}
  }

  function adjustTextSize(direction: -1 | 1) {
    textScale = Math.min(1.6, Math.max(0.7, Math.round((textScale + direction * 0.1) * 10) / 10));
    savePrefs();
  }

  function setNumCols(value: number) {
    numCols = value;
    fillSelectedIds();
    savePrefs();
    load();
  }

  function setTranslation(index: number, id: number) {
    selectedIds[index] = id;
    selectedIds = [...selectedIds];
    savePrefs();
    load();
  }

  async function load() {
    if (!ready || !ref.trim() || selectedIds.length === 0) return;
    const version = ++loadVersion;
    // Match the API's deduplication and keep edition metadata with this response.
    const requestedIds = [...new Set(selectedIds)];
    loading = true;
    error = '';
    savePrefs();

    try {
      const parsed = parseReference(ref);

      if (!parsed.book || !parsed.chapter) {
        error = 'Référence non reconnue. Essayez par exemple « Jean 3:16 » ou « Ps 22 ».';
        columns = [];
        return;
      }

      const params = new URLSearchParams({
        db: offlineBible.sha256,
        book: parsed.book,
        chapter: String(parsed.chapter)
      });
      if (parsed.verse) params.set('verse', String(parsed.verse));
      if (parsed.verseEnd) params.set('verseEnd', String(parsed.verseEnd));
      requestedIds.forEach(id => params.append('t', String(id)));

      const data = await readComparatorPassage(params, requestedIds.map(id => translations.find(t => t.id === id)!.code));
      if (version !== loadVersion) return;

      columns = (data.results ?? []).map((column: Column, index: number) => ({
        ...column,
        meta: translations.find((translation) => translation.id === requestedIds[index]),
      }));
      current = {
        book: data.book,
        chapter: data.chapter,
        verse: data.verse || null,
        verseEnd: data.verseEnd || parsed.verseEnd || null,
      };

      nav = data.navigation ?? getBibleNavigation(initialNavigationBooks, current);
    } catch (e) {
      if (version !== loadVersion) return;
      error = e instanceof OfflineBibleRequiredError ? e.message : 'Le passage n’a pas pu être chargé.';
      columns = [];
      console.error(e);
    } finally {
      if (version === loadVersion) loading = false;
    }
  }

  async function navigate(dir: 'prev' | 'next') {
    const target = nav[dir];
    if (!target) return;
    ref = formatRefLabel({ ...target, verse: target.verse ?? null, verseEnd: null });
    await load();
  }

  function onHover(verse: number, enter: boolean) {
    highlightedVerse = enter ? verse : null;
  }
</script>

<div class="comparator" aria-busy={loading} style={`--text-scale: ${textScale}`}>
  <section class="comparator-controls" style={`--column-count: ${columns.length || numCols}`} aria-label="Choisir un passage et des traductions">
    <div class="controls-top">
      <div class="reference-field">
        <label for="cmp-ref">Passage</label>
        <div class="reference-input">
          <PassagePicker
            books={initialNavigationBooks}
            currentBook={current.book}
            currentChapter={current.chapter}
            onselect={(book, chapter) => {
              ref = formatRefLabel({ book, chapter, verse: null, verseEnd: null });
              load();
            }}
          />
          <input
            id="cmp-ref"
            type="text"
            bind:value={ref}
            on:keydown={(event) => event.key === 'Enter' && load()}
            placeholder="Jean 3:16"
            autocomplete="off"
            aria-describedby={error ? 'comparator-error' : undefined}
            aria-invalid={error ? 'true' : undefined}
          />
          <button on:click={load} aria-label="Charger ce passage">Lire <span aria-hidden="true">→</span></button>
        </div>
      </div>

      <div class="offline-control"><OfflinePanel metadata={offlineBible} onready={() => load()} /></div>

      <fieldset class="text-size-control">
        <legend>Taille du texte</legend>
        <div>
          <button
            type="button"
            aria-label="Réduire la taille du texte"
            disabled={textScale <= 0.7}
            on:click={() => adjustTextSize(-1)}
          >−</button>
          <output aria-live="polite" aria-label="Échelle du texte">{Math.round(textScale * 100)} %</output>
          <button
            type="button"
            aria-label="Augmenter la taille du texte"
            disabled={textScale >= 1.6}
            on:click={() => adjustTextSize(1)}
          >+</button>
        </div>
      </fieldset>

      <fieldset class="column-count">
        <legend>Pages en regard</legend>
        <div>
          {#each [1, 2, 3, 4] as count}
            <button
              type="button"
              class:is-active={numCols === count}
              aria-pressed={numCols === count}
              on:click={() => setNumCols(count)}
            >{count}</button>
          {/each}
        </div>
      </fieldset>

      <label class="align-toggle">
        <input
          type="checkbox"
          checked={align}
          on:change={(event) => {
            align = event.currentTarget.checked;
            savePrefs();
          }}
        />
        <span>Aligner</span>
      </label>

      <div class="loading-mark" aria-live="polite">
        <span class="cmp-spinner" class:cmp-spinner-on={loading} aria-hidden={!loading}></span>
        <span class="sr-only">{loading ? 'Chargement du passage' : ''}</span>
      </div>
    </div>

    <div class="translation-pickers" style={`--picker-count: ${numCols}`}>
      {#each Array(numCols) as _, index}
        <div class="translation-picker">
          <label for={`cmp-tr-${index}`}>Page {index + 1}</label>
          <select
            id={`cmp-tr-${index}`}
            value={selectedIds[index]}
            on:change={(event) => setTranslation(index, Number(event.currentTarget.value))}
          >
            {#each translations as translation}
              <option value={translation.id}>
                {translation.name_short}
              </option>
            {/each}
          </select>
        </div>
      {/each}
    </div>
  </section>

  <nav class="passage-navigation" style={`--column-count: ${Math.max(1, columns.length)}`} aria-label="Navigation dans la Bible">
    <button on:click={() => navigate('prev')} disabled={loading || !nav.prev} aria-label="Passage précédent">
      <span aria-hidden="true">←</span> <span>Précédent</span>
    </button>
    {#if current.book}
      <div aria-live="polite">
        <p>Passage consulté</p>
        <h2>{formatRefLabel(current)}</h2>
      </div>
    {/if}
    <button on:click={() => navigate('next')} disabled={loading || !nav.next} aria-label="Passage suivant">
      <span>Suivant</span> <span aria-hidden="true">→</span>
    </button>
  </nav>

  {#if error}
    <div id="comparator-error" class="comparator-error" role="alert">
      <p>{error}</p>
    </div>
  {/if}

  {#if columns.length > 0}
      <div
        class="reading-columns"
        class:align-verses={align}
        data-count={columns.length}
        style={`--column-count: ${columns.length}; --verse-count: ${Math.max(1, verseNumbers.length)}; --row-count: ${align ? Math.max(1, verseNumbers.length) + 1 : 2}`}
      >
        {#each readingColumns as column}
          {@const meta = column.meta}
          <article class="translation-page">
            <header class="translation-header">
              <p class="translation-code">{column.code} · {meta?.language_label || 'Traduction'}</p>
              <h3>{meta?.name_short || column.name}</h3>
              {#if meta && (meta.date_label || meta.authors_label || meta.source_label)}
                <details class="edition-details" open={!compactLayout}>
                  <summary>Édition</summary>
                <dl>
                  <div>
                    <dt>Date</dt>
                    <dd>{meta.date_label}</dd>
                  </div>
                  <div>
                    <dt>Traducteur</dt>
                    <dd>{meta.authors_label}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{meta.source_label}</dd>
                  </div>
                </dl>
                {#if meta.notice}
                  <details>
                    <summary>Notice de l’édition</summary>
                    <p>{meta.notice}</p>
                  </details>
                {/if}
                </details>
              {/if}
            </header>

            <div class="verses">
              {#each column.verses as verse}
                <div
                  class="verse"
                  class:highlight={highlightedVerse === verse.verse}
                  class:verse-missing={!verse.text}
                  data-verse={verse.verse}
                  on:mouseenter={() => onHover(verse.verse, true)}
                  on:mouseleave={() => onHover(verse.verse, false)}
                  role="presentation"
                >
                  <span class="verse-number">{verse.verse}</span>
                  <p>{verse.text || 'Verset absent de cette édition.'}</p>
                </div>
              {/each}
            </div>
          </article>
        {/each}
      </div>
  {:else if ready && !loading && !error}
    <p class="empty-state">Choisissez un passage pour commencer la lecture.</p>
  {/if}
</div>

<style>
  .comparator {
    --control-height: 2.75rem;
    --verse-base-size: 1.12rem;
    container: comparator / inline-size;
  }

  .comparator-controls {
    position: sticky;
    z-index: 20;
    top: 4.75rem;
    padding: 1.1rem clamp(1rem, 2.2vw, 1.75rem) 1rem;
    border: 1px solid var(--border);
    background: color-mix(in oklab, var(--card) 94%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 16px 28px -30px rgba(30, 20, 12, 0.75);
  }

  .controls-top {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    align-items: flex-end;
  }

  .reference-field {
    flex: 1 1 16.75rem;
    min-width: min(100%, 16.75rem);
  }

  .offline-control { flex: none; order: 1; }

  .text-size-control,
  .column-count {
    flex: none;
  }

  label,
  legend {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--text-subtle);
    font-family: var(--type-ui);
    font-size: 0.64rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .reference-input {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    height: var(--control-height);
    border-bottom: 1px solid var(--text);
  }

  .reference-input input {
    min-width: 0;
    padding: 0 0.35rem;
    border: 0;
    background: transparent;
    color: var(--text);
    font-family: var(--type-display);
    font-size: 1.3rem;
  }

  .reference-input:focus-within {
    border-color: var(--accent);
  }

  .reference-input input:focus-visible,
  .translation-picker select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .reference-input button {
    padding: 0 0.55rem;
    color: var(--accent);
    font-family: var(--type-ui);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .column-count > div,
  .text-size-control > div {
    display: flex;
    height: var(--control-height);
    border: 1px solid var(--border);
  }

  .text-size-control button {
    width: 2.5rem;
    color: var(--accent);
    font-family: var(--type-ui);
    font-size: 1.1rem;
  }

  .text-size-control button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .text-size-control output {
    display: grid;
    min-width: 2.8rem;
    place-items: center;
    color: var(--text-muted);
    font-family: var(--type-ui);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  .column-count button {
    width: 2.45rem;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--type-ui);
    font-size: 0.78rem;
  }

  .column-count button:last-child {
    border-right: 0;
  }

  .column-count button.is-active {
    background: var(--accent);
    color: var(--accent-fg);
  }

  .align-toggle {
    flex: none;
    display: flex;
    height: var(--control-height);
    align-items: center;
    gap: 0.55rem;
    margin: 0;
    color: var(--text-muted);
    font-size: 0.68rem;
    letter-spacing: 0.045em;
    text-transform: none;
  }

  .align-toggle input {
    width: 0.95rem;
    height: 0.95rem;
    accent-color: var(--accent);
  }

  .loading-mark {
    flex: none;
    display: grid;
    width: 1.5rem;
    height: var(--control-height);
    place-items: center;
  }

  .translation-pickers {
    display: grid;
    grid-template-columns: repeat(var(--picker-count), minmax(0, 1fr));
    gap: 1rem;
    margin-top: 0.85rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--border);
  }

  .translation-picker label {
    margin-bottom: 0.15rem;
  }

  .translation-picker select {
    min-width: 0;
    width: 100%;
    padding: 0.35rem 1.5rem 0.35rem 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-family: var(--type-body);
    font-size: 0.85rem;
  }

  .passage-navigation {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 1rem;
    padding: 2.3rem 0 0.25rem;
  }

  .comparator-controls,
  .passage-navigation,
  .reading-columns {
    max-width: max(68rem, calc(var(--column-count) * 34rem));
    margin-inline: auto;
  }

  .passage-navigation > div {
    grid-column: 1 / -1;
    grid-row: 1;
    text-align: center;
  }

  .passage-navigation p {
    color: var(--text-subtle);
    font-family: var(--type-ui);
    font-size: 0.62rem;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .passage-navigation h2 {
    margin-top: 0.2rem;
    font-family: var(--type-display);
    font-size: clamp(1.8rem, 3vw, 2.5rem);
    line-height: 1;
  }

  .passage-navigation button {
    grid-row: 2;
    display: flex;
    min-width: 2.75rem;
    min-height: 2.75rem;
    align-items: flex-end;
    padding-bottom: 0.25rem;
    gap: 0.5rem;
    color: var(--text);
    font-family: var(--type-ui);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .passage-navigation button:last-child {
    justify-self: end;
    justify-content: flex-end;
  }

  .passage-navigation button:disabled {
    opacity: 0.28;
  }

  .reading-columns {
    display: grid;
    grid-template-columns: repeat(var(--column-count), minmax(0, 1fr));
    gap: 0 1px;
    border: 1px solid var(--border);
    background: var(--border);
  }

  .translation-page {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: span var(--row-count);
    row-gap: 0;
    min-width: 0;
    padding-bottom: 0.7rem;
    background: var(--card);
    overflow-wrap: anywhere;
  }

  .translation-header {
    padding: 1.5rem clamp(1.1rem, 2.5vw, 2rem) 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  .translation-code {
    color: var(--gold);
    font-family: var(--type-ui);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .translation-header h3 {
    margin-top: 0.45rem;
    font-family: var(--type-display);
    font-size: clamp(0.95rem, calc(10cqw / var(--column-count)), 2.45rem);
    line-height: 1;
  }

  .translation-header dl {
    display: grid;
    grid-template-columns: 0.72fr 1.25fr 1.2fr;
    gap: 0.75rem;
    margin-top: 1.2rem;
  }

  .translation-header dt {
    color: var(--text-subtle);
    font-family: var(--type-ui);
    font-size: 0.57rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .translation-header dd {
    margin-top: 0.18rem;
    color: var(--text-muted);
    font-size: 0.7rem;
    line-height: 1.35;
  }

  details {
    margin-top: 1rem;
    color: var(--text-subtle);
    font-size: 0.72rem;
  }

  .edition-details {
    margin-top: 0.85rem;
  }

  summary {
    cursor: pointer;
    font-family: var(--type-ui);
    font-size: 0.62rem;
    letter-spacing: 0.05em;
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-transform: uppercase;
  }

  details p {
    margin-top: 0.55rem;
    line-height: 1.5;
  }

  .verses {
    align-self: start;
    padding-top: 0.7rem;
  }

  .align-verses .verses {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: span var(--verse-count);
    row-gap: 0;
    align-self: stretch;
  }

  .verse {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 0.5rem;
    padding: 0.72rem clamp(0.75rem, 1.5vw, 1.5rem);
    transition: background 120ms ease;
  }

  .verse.highlight {
    background: color-mix(in oklab, var(--accent) 9%, transparent);
  }

  .verse-missing p {
    color: var(--text-subtle);
    font-style: italic;
    font-size: 0.85rem;
  }

  .verse-number {
    min-width: 3ch;
    padding-top: 0.18rem;
    color: var(--gold);
    font-family: var(--type-ui);
    font-size: 0.62rem;
    text-align: left;
    user-select: none;
  }

  .verse p {
    font-size: calc(var(--verse-base-size) * var(--text-scale));
    line-height: 1.62;
  }

  .comparator-error,
  .empty-state {
    margin: 1rem 0;
    padding: 1rem 1.2rem;
    border-left: 2px solid var(--accent);
    background: color-mix(in oklab, var(--accent) 7%, transparent);
    color: var(--text-muted);
  }

  .cmp-spinner {
    width: 1.05rem;
    height: 1.05rem;
    border: 1px solid color-mix(in oklab, var(--text) 20%, transparent);
    border-top-color: var(--gold);
    border-radius: 999px;
    opacity: 0;
    transition: opacity 180ms ease;
  }

  .cmp-spinner-on {
    opacity: 1;
    animation: cmp-spin 700ms linear infinite;
  }

  @keyframes cmp-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 1440px) {
    .comparator-controls {
      max-width: none;
    }
  }

  @media (max-width: 1000px) {
    .controls-top {
      gap: 0.75rem 1rem;
    }

    .translation-pickers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 1000px), (pointer: coarse) and (max-height: 600px) {
    .comparator {
      --verse-base-size: 0.875rem;
    }

    .comparator-controls {
      position: static;
      padding: 0.8rem 0.55rem;
    }

    .comparator-controls,
    .passage-navigation,
    .reading-columns {
      max-width: none;
    }

    .reading-columns[data-count="3"] {
      --verse-base-size: 0.8125rem;
    }

    .reading-columns[data-count="4"] {
      --verse-base-size: 0.75rem;
    }

    .translation-header {
      padding: 0.8rem clamp(0.25rem, 1vw, 0.7rem) 0.7rem;
    }

    .translation-code {
      font-size: 0.55rem;
      letter-spacing: 0.03em;
    }

    .translation-header dl {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.5rem;
      margin-top: 0.7rem;
    }

    .translation-header dd {
      font-size: 0.65rem;
    }

    .edition-details {
      margin-top: 0.65rem;
    }

    summary {
      font-size: 0.57rem;
      letter-spacing: 0;
    }

    .verse {
      padding-block: 0.5rem;
    }

    .verse-number {
      padding-top: 0.2em;
      font-size: calc(var(--verse-base-size) * var(--text-scale) * 0.65);
    }

    .verse p {
      line-height: 1.5;
      hyphens: auto;
    }
  }

  @media (max-width: 680px) {
    .verse {
      column-gap: 0.3rem;
      padding-inline: 0.25rem;
    }

    .comparator-controls {
      padding-inline: 0.45rem;
    }

    .controls-top {
      gap: 0.75rem 0.5rem;
    }

    .reference-field { flex: 1 1 calc(100% - 3.25rem); min-width: 0; }
    .offline-control { order: 0; }

    .loading-mark {
      display: none;
    }

    .align-toggle {
      gap: 0.3rem;
      font-size: 0.63rem;
    }

    .translation-pickers {
      gap: 0.35rem 0.75rem;
      margin-top: 0.7rem;
      padding-top: 0.7rem;
    }

    .translation-picker {
      min-width: 0;
    }

    .passage-navigation {
      padding-top: 1.7rem;
    }

    .passage-navigation button span:not([aria-hidden]) {
      display: none;
    }

    .column-count button {
      width: 2.2rem;
    }

    .text-size-control button {
      width: 2.25rem;
    }

    .text-size-control output {
      min-width: 2.4rem;
    }
  }
</style>
