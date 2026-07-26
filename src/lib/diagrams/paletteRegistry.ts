/** Fixed, hand-authored symbol palettes for DiagramSlot options. Never AI-extended — the AI
 * only ever picks a `correctOption` id from an existing palette via a template's params; the
 * palette definitions themselves (and their glyph rendering) are developer-owned. */

export type DiagramGlyphKind = 'dot' | 'cross' | 'plus' | 'minus' | 'text';

export interface DiagramPaletteOption {
  id: string;
  label: string;
  glyphKind: DiagramGlyphKind;
  glyphText?: string; // for glyphKind:'text' — the short text rendered in the chip/slot
}

export interface DiagramPalette {
  id: string;
  options: DiagramPaletteOption[];
}

export const DIAGRAM_SYMBOL_PALETTES: Record<string, DiagramPalette> = {
  'dot-cross': {
    id: 'dot-cross',
    options: [
      { id: 'dot', label: 'Dot (electron from this atom)', glyphKind: 'dot' },
      { id: 'cross', label: 'Cross (electron from the other atom)', glyphKind: 'cross' },
      { id: 'empty', label: 'No electron here', glyphKind: 'text', glyphText: '' },
    ],
  },
  electron: {
    id: 'electron',
    options: [
      { id: 'electron', label: 'Electron', glyphKind: 'dot' },
      { id: 'empty', label: 'No electron here', glyphKind: 'text', glyphText: '' },
    ],
  },
  'ionic-charge': {
    id: 'ionic-charge',
    options: [
      { id: 'plus1', label: '+', glyphKind: 'plus', glyphText: '+' },
      { id: 'minus1', label: '−', glyphKind: 'minus', glyphText: '−' },
      { id: 'plus2', label: '2+', glyphKind: 'text', glyphText: '2+' },
      { id: 'minus2', label: '2−', glyphKind: 'text', glyphText: '2−' },
    ],
  },
  'image-nature': {
    id: 'image-nature',
    options: [
      { id: 'real', label: 'Real', glyphKind: 'text', glyphText: 'Real' },
      { id: 'virtual', label: 'Virtual', glyphKind: 'text', glyphText: 'Virtual' },
    ],
  },
  'image-orientation': {
    id: 'image-orientation',
    options: [
      { id: 'upright', label: 'Upright', glyphKind: 'text', glyphText: 'Upright' },
      { id: 'inverted', label: 'Inverted', glyphKind: 'text', glyphText: 'Inverted' },
    ],
  },
  'image-size': {
    id: 'image-size',
    options: [
      { id: 'magnified', label: 'Magnified', glyphKind: 'text', glyphText: 'Magnified' },
      { id: 'diminished', label: 'Diminished', glyphKind: 'text', glyphText: 'Diminished' },
      { id: 'same-size', label: 'Same size', glyphKind: 'text', glyphText: 'Same size' },
    ],
  },
};

export const getDiagramPalette = (paletteId: string): DiagramPalette | null => DIAGRAM_SYMBOL_PALETTES[paletteId] ?? null;

export const isValidPaletteOption = (paletteId: string, optionId: string): boolean =>
  getDiagramPalette(paletteId)?.options.some((option) => option.id === optionId) ?? false;
