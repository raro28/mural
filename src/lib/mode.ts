export type Mode = 'zoom' | 'fill' | 'fit' | 'center';

// mode -> GDesktopBackgroundStyle value (verified on host: ZOOM 5, STRETCHED 4,
// SCALED 3, CENTERED 2).
const STYLE: Record<Mode, number> = { zoom: 5, fill: 4, fit: 3, center: 2 };

/** Background-style value for a mode string; unknown/undefined -> zoom (5). */
export function modeToStyle(mode: string | undefined): number {
  return STYLE[mode as Mode] ?? STYLE.zoom;
}

/** A valid Mode for a string; unknown/undefined -> 'zoom'. */
export function normalizeMode(mode: string | undefined): Mode {
  return mode !== undefined && mode in STYLE ? (mode as Mode) : 'zoom';
}
