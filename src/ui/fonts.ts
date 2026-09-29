/**
 * Fonts of the map and the menu. They ship with the game (public/assets/fonts, SIL Open Font License,
 * see CREDITS.md). Loaded with the FontFace API, so the URLs are relative to the page, wherever it is served from.
 */
interface Face { family: string; style: string; weight: string; file: string; range: string }
const FONT_FACES: Face[] = [
  { family: 'Almendra', style: 'italic', weight: '400', file: 'assets/fonts/almendra-italic-400-latin-ext.woff2', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { family: 'Almendra', style: 'italic', weight: '400', file: 'assets/fonts/almendra-italic-400-latin.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'Almendra', style: 'italic', weight: '700', file: 'assets/fonts/almendra-italic-700-latin-ext.woff2', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { family: 'Almendra', style: 'italic', weight: '700', file: 'assets/fonts/almendra-italic-700-latin.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'Cinzel', style: 'normal', weight: '400 900', file: 'assets/fonts/cinzel-normal-400-900-latin-ext.woff2', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { family: 'Cinzel', style: 'normal', weight: '400 900', file: 'assets/fonts/cinzel-normal-400-900-latin.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'UnifrakturCook', style: 'normal', weight: '700', file: 'assets/fonts/unifrakturcook-normal-700-latin.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'Cormorant Garamond', style: 'italic', weight: '500', file: 'assets/fonts/cormorant-garamond-italic-500-latin-ext.woff2', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { family: 'Cormorant Garamond', style: 'italic', weight: '500', file: 'assets/fonts/cormorant-garamond-italic-500-latin.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'Cormorant Garamond', style: 'normal', weight: '500 700', file: 'assets/fonts/cormorant-garamond-normal-500-700-latin-ext.woff2', range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { family: 'Cormorant Garamond', style: 'normal', weight: '500 700', file: 'assets/fonts/cormorant-garamond-normal-500-700-latin.woff2', range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
];

let loading: Promise<void> | null = null;
/** Starts loading every face (once) and resolves when they have all arrived; a missing font falls back to Georgia. */
export function loadFonts(): Promise<void> {
  if (!('FontFace' in window)) return Promise.resolve();
  return loading ??= Promise.all(FONT_FACES.map(f => {
    const face = new FontFace(f.family, `url(${f.file})`, { style: f.style, weight: f.weight, unicodeRange: f.range });
    document.fonts.add(face);
    return face.load().catch(() => face);
  })).then(() => undefined);
}
