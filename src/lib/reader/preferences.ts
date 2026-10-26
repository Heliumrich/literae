export const READER_FONTS = {
  site: { label: 'Police du site', family: '"Source Serif 4", Georgia, serif' },
  literata: { label: 'Literata', family: '"Literae Literata", Georgia, serif' },
  lora: { label: 'Lora', family: '"Literae Lora", Georgia, serif' },
  'libre-baskerville': { label: 'Libre Baskerville', family: '"Literae Libre Baskerville", Georgia, serif' },
} as const;
export const PALETTES = {
  paper: { bg: '#fdfcf9', fg: '#241e18', link: '#762333' },
  cream: { bg: '#f1eadc', fg: '#241e18', link: '#762333' },
  night: { bg: '#171513', fg: '#eee5d6', link: '#e4a1ae' },
  oled: { bg: '#000000', fg: '#e7e1d7', link: '#e4a1ae' },
};
export type ReaderSettings = {
  font: keyof typeof READER_FONTS; size: number; margin: number; justify: boolean; hyphenate: boolean;
  palette: 'auto' | keyof typeof PALETTES;
};
export const SETTINGS_KEY = 'literae-reader-settings-v1';
export const DEFAULT_SETTINGS: ReaderSettings = { font: 'site', size: 20, margin: 32, justify: false, hyphenate: true, palette: 'auto' };
export function parseSettings(value: unknown): ReaderSettings {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const bounded = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return {
    font: typeof row.font === 'string' && Object.hasOwn(READER_FONTS, row.font) ? row.font as ReaderSettings['font'] : 'site',
    palette: row.palette === 'auto' || typeof row.palette === 'string' && Object.hasOwn(PALETTES, row.palette) ? row.palette as ReaderSettings['palette'] : 'auto',
    size: bounded(row.size, 16, 32, 20), margin: bounded(row.margin, 8, 80, 32), justify: row.justify === true, hyphenate: row.hyphenate !== false,
  };
}

/** Injected into EPUB frames only. Optional WOFF2 files are requested on selection. */
export function readerCss(settings: ReaderSettings, dark: boolean, origin: string): string {
  const palette = PALETTES[settings.palette === 'auto' ? dark ? 'night' : 'cream' : settings.palette];
  const font = READER_FONTS[settings.font];
  const faces = settings.font === 'site' ? `
    @font-face { font-family: "Source Serif 4"; src: url("${origin}/fonts/source-serif-4-400-normal-latin.woff2"); font-style: normal; font-display: swap; }
    @font-face { font-family: "Source Serif 4"; src: url("${origin}/fonts/source-serif-4-400-italic-latin.woff2"); font-style: italic; font-display: swap; }
  ` : ['normal', 'italic'].flatMap(style => ['latin', 'latin-ext'].map(subset => `
    @font-face { font-family: ${font.family.split(',')[0]}; src: url("${origin}/reader-fonts/${settings.font}-${subset}-400-${style}.woff2") format("woff2"); font-weight: 400; font-style: ${style}; font-display: swap;
      unicode-range: ${subset === 'latin' ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'};
    }`)).join('');
  return `${faces}
    html, body { background: ${palette.bg} !important; color: ${palette.fg} !important; }
    body { box-sizing: border-box !important; margin: 0 auto !important; padding: 24px ${settings.margin}px !important; max-width: 54rem !important;
      font-family: ${font.family} !important; font-size: ${settings.size}px !important; line-height: 1.7 !important; overflow-wrap: break-word; }
    body * { color: inherit !important; background-color: transparent !important; }
    body *:not(h1,h2,h3,h4,h5,h6):not(h1 *,h2 *,h3 *,h4 *,h5 *,h6 *) { font-family: ${font.family} !important; }
    p, li, blockquote, dd, dt, td { font-size: inherit !important; line-height: 1.7 !important; text-align: ${settings.justify ? 'justify' : 'start'} !important; -webkit-hyphens: ${settings.hyphenate ? 'auto' : 'none'} !important; hyphens: ${settings.hyphenate ? 'auto' : 'none'} !important; }
    p { margin-block: .7em !important; text-indent: 0 !important; }
    p *, li *, blockquote * { font-size: inherit !important; }
    h1, h2, h3, h4, h5, h6 { font-family: Georgia, serif !important; line-height: 1.3 !important; text-align: start !important; }
    h1 { font-size: 2em !important; } h2 { font-size: 1.5em !important; } h3 { font-size: 1.2em !important; }
    a, a * { color: ${palette.link} !important; } a { text-decoration: underline !important; }
    img, svg { max-width: 100% !important; height: auto; } table { max-width: 100%; }
    ::selection { background: ${palette.link}; color: ${palette.bg}; }
  `;
}
