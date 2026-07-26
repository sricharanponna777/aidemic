import type { DiagramTemplateDefinition } from '../../types';
import { addScaled, evenlySpacedAngles, makePrimitive, makeSlot, perpendicular, pointOnCircle, unitVector } from '../../geometry';
import { enumParam } from '../../paramHelpers';

// ---------------------------------------------------------------------------
// Ionic dot-and-cross
// ---------------------------------------------------------------------------

interface IonicCompound {
  name: string;
  cationSymbol: string;
  cationCharge: string;
  anionSymbol: string;
  anionCharge: string;
  anionCount: 1 | 2;
  anionOwnElectrons: number; // original outer-shell electrons drawn as crosses
  transferredPerAnion: number; // electrons transferred from the cation, drawn as dots
}

const IONIC_COMPOUND_LIBRARY: Record<string, IonicCompound> = {
  nacl: { name: 'Sodium chloride, NaCl', cationSymbol: 'Na', cationCharge: '+', anionSymbol: 'Cl', anionCharge: '−', anionCount: 1, anionOwnElectrons: 7, transferredPerAnion: 1 },
  kcl: { name: 'Potassium chloride, KCl', cationSymbol: 'K', cationCharge: '+', anionSymbol: 'Cl', anionCharge: '−', anionCount: 1, anionOwnElectrons: 7, transferredPerAnion: 1 },
  lif: { name: 'Lithium fluoride, LiF', cationSymbol: 'Li', cationCharge: '+', anionSymbol: 'F', anionCharge: '−', anionCount: 1, anionOwnElectrons: 7, transferredPerAnion: 1 },
  mgo: { name: 'Magnesium oxide, MgO', cationSymbol: 'Mg', cationCharge: '2+', anionSymbol: 'O', anionCharge: '2−', anionCount: 1, anionOwnElectrons: 6, transferredPerAnion: 2 },
  mgcl2: { name: 'Magnesium chloride, MgCl₂', cationSymbol: 'Mg', cationCharge: '2+', anionSymbol: 'Cl', anionCharge: '−', anionCount: 2, anionOwnElectrons: 7, transferredPerAnion: 1 },
};

const IONIC_COMPOUND_IDS = Object.keys(IONIC_COMPOUND_LIBRARY);

interface IonicParams {
  compoundId: string;
}

const SHELL_R = 15;
const ELECTRON_R = 12.5;
// Atom/ion symbols are drawn as text at the centre of their shell (exam convention) rather than as
// label nodes, which would render as boxes over the atom.
const SYMBOL_FONT_SIZE = 6;

const symbolPrimitive = (x: number, y: number, text: string) =>
  makePrimitive({ kind: 'text', x, y, text, fontSize: SYMBOL_FONT_SIZE, fill: 'currentColor' });

function buildAnionShell(id: string, cx: number, cy: number, compound: IonicCompound) {
  const primitives = [
    makePrimitive({ kind: 'circle', cx, cy, r: SHELL_R, stroke: 'currentColor', fill: 'none', strokeWidth: 0.6 }),
  ];
  const centerSymbol = symbolPrimitive(cx, cy, compound.anionSymbol);
  const chargePrimitive = makePrimitive({
    kind: 'text',
    x: cx + SHELL_R * 0.75,
    y: cy - SHELL_R * 0.75,
    text: compound.anionCharge,
    fontSize: 5,
    fill: 'currentColor',
  });

  const totalElectrons = compound.anionOwnElectrons + compound.transferredPerAnion;
  const angles = evenlySpacedAngles(totalElectrons, -90, 360);
  const slots = angles.map((angle, index) => {
    const pos = pointOnCircle(cx, cy, ELECTRON_R, angle);
    const isTransferred = index >= compound.anionOwnElectrons;
    return makeSlot({
      id: `${id}-e${index}`,
      x: pos.x,
      y: pos.y,
      paletteId: 'dot-cross',
      correctOption: isTransferred ? 'dot' : 'cross',
      // All electrons on this anion's outer shell are interchangeable positions: only the count of
      // dots (transferred) vs crosses (the anion's own) matters, not which position each sits in.
      group: `${id}-shell`,
      description: isTransferred
        ? `Electron transferred from ${compound.cationSymbol} into the outer shell of ${compound.anionSymbol}`
        : `${compound.anionSymbol}'s own outer-shell electron`,
    });
  });

  return { primitives: [...primitives, centerSymbol, chargePrimitive], slots };
}

const dotAndCrossIonic: DiagramTemplateDefinition<IonicParams> = {
  id: 'bonding-ionic',
  category: 'bonding',
  promptBlurb: `Ionic dot-and-cross diagram. params.compoundId one of: ${IONIC_COMPOUND_IDS.join(', ')}. Renders the cation (ion symbol + charge, no outer shell drawn) and the anion(s) with a full outer-shell ring; the student places a dot or cross symbol into each blanked electron slot.`,
  paramDocs: `stringParams: [{key:'compoundId', value: one of ${IONIC_COMPOUND_IDS.join('|')}}]`,
  blankablePartIds: [],
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const compoundId = enumParam(selection, 'compoundId', IONIC_COMPOUND_IDS);
    return compoundId ? { compoundId } : null;
  },
  build: (params) => {
    const compound = IONIC_COMPOUND_LIBRARY[params.compoundId];
    const cationSymbol = symbolPrimitive(22, 50, `${compound.cationSymbol}${compound.cationCharge}`);

    const anionShells =
      compound.anionCount === 1
        ? [buildAnionShell('anion', 70, 50, compound)]
        : [buildAnionShell('anion1', 72, 27, compound), buildAnionShell('anion2', 72, 73, compound)];

    return {
      title: `Dot-and-cross diagram: ${compound.name}`,
      primitives: [cationSymbol, ...anionShells.flatMap((shell) => shell.primitives)],
      nodes: [],
      connections: [],
      slots: anionShells.flatMap((shell) => shell.slots),
      labelBank: [],
    };
  },
};

// Every anion shell's slots are blankable — collected after the library/template are defined so
// the ids stay derived from IONIC_COMPOUND_LIBRARY rather than hand-duplicated.
dotAndCrossIonic.blankableSlotIds = Object.entries(IONIC_COMPOUND_LIBRARY).flatMap(([, compound]) => {
  const total = compound.anionOwnElectrons + compound.transferredPerAnion;
  const shellIds = compound.anionCount === 1 ? ['anion'] : ['anion1', 'anion2'];
  return shellIds.flatMap((shellId) => Array.from({ length: total }, (_, i) => `${shellId}-e${i}`));
});

// ---------------------------------------------------------------------------
// Covalent dot-and-cross
// ---------------------------------------------------------------------------

interface CovalentBond {
  outerSymbol: string;
  bondOrder: 1 | 2 | 3;
  outerLonePairs: number;
}

interface CovalentMolecule {
  name: string;
  centralSymbol: string;
  centralLonePairs: number;
  bonds: CovalentBond[];
}

const COVALENT_MOLECULE_LIBRARY: Record<string, CovalentMolecule> = {
  h2: { name: 'Hydrogen, H₂', centralSymbol: 'H', centralLonePairs: 0, bonds: [{ outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 }] },
  cl2: { name: 'Chlorine, Cl₂', centralSymbol: 'Cl', centralLonePairs: 3, bonds: [{ outerSymbol: 'Cl', bondOrder: 1, outerLonePairs: 3 }] },
  hcl: { name: 'Hydrogen chloride, HCl', centralSymbol: 'H', centralLonePairs: 0, bonds: [{ outerSymbol: 'Cl', bondOrder: 1, outerLonePairs: 3 }] },
  h2o: {
    name: 'Water, H₂O',
    centralSymbol: 'O',
    centralLonePairs: 2,
    bonds: [
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
    ],
  },
  ch4: {
    name: 'Methane, CH₄',
    centralSymbol: 'C',
    centralLonePairs: 0,
    bonds: [
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
    ],
  },
  nh3: {
    name: 'Ammonia, NH₃',
    centralSymbol: 'N',
    centralLonePairs: 1,
    bonds: [
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
      { outerSymbol: 'H', bondOrder: 1, outerLonePairs: 0 },
    ],
  },
  o2: { name: 'Oxygen, O₂', centralSymbol: 'O', centralLonePairs: 2, bonds: [{ outerSymbol: 'O', bondOrder: 2, outerLonePairs: 2 }] },
  n2: { name: 'Nitrogen, N₂', centralSymbol: 'N', centralLonePairs: 1, bonds: [{ outerSymbol: 'N', bondOrder: 3, outerLonePairs: 1 }] },
  co2: {
    name: 'Carbon dioxide, CO₂',
    centralSymbol: 'C',
    centralLonePairs: 0,
    bonds: [
      { outerSymbol: 'O', bondOrder: 2, outerLonePairs: 2 },
      { outerSymbol: 'O', bondOrder: 2, outerLonePairs: 2 },
    ],
  },
};

const COVALENT_MOLECULE_IDS = Object.keys(COVALENT_MOLECULE_LIBRARY);

interface CovalentParams {
  moleculeId: string;
}

const CENTRAL_R = 11;
const OUTER_R = 8.5;
const OVERLAP_DEPTH = 6;
const PAIR_RADIAL_SPACING = 2.8; // gap between the pairs of a multiple bond, stacked along the bond axis
const PAIR_TANGENT_HALF_GAP = 1.7; // dot/cross offset within a pair, ACROSS the overlap (parallel to the lens)
const LONE_PAIR_OFFSET = 2.2;
const LONE_PAIR_HALF_GAP = 1.1;

/** Angles (around a circle) for `count` lone-pair positions that avoid the given bond angles —
 * places them evenly across the largest available gap between (or, with a single bond, opposite) the
 * occupied directions. Sufficient for every molecule in COVALENT_MOLECULE_LIBRARY (max 3 lone pairs
 * sharing a single-bond atom's one large gap, or 1 lone pair per gap when there are 2-3 bonds). */
function lonePairAngles(bondAngles: number[], count: number): number[] {
  if (count === 0) return [];
  if (bondAngles.length === 0) return evenlySpacedAngles(count, -90, 360);

  const sorted = [...bondAngles].sort((a, b) => a - b);
  const gaps = sorted.map((start, i) => {
    const end = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
    return { mid: (start + end) / 2, size: end - start };
  });
  gaps.sort((a, b) => b.size - a.size);

  if (count <= gaps.length) {
    return gaps.slice(0, count).map((g) => g.mid);
  }
  // More lone pairs than gaps (e.g. a single-bond atom needing 3 lone pairs): spread them all
  // across the single largest gap instead.
  const largest = gaps[0];
  const inset = Math.min(largest.size * 0.35, 60);
  const span = largest.size - 2 * inset;
  const step = count > 1 ? span / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => largest.mid - span / 2 + i * step);
}

const dotAndCrossCovalent: DiagramTemplateDefinition<CovalentParams> = {
  id: 'bonding-covalent',
  category: 'bonding',
  promptBlurb: `Covalent dot-and-cross diagram. params.moleculeId one of: ${COVALENT_MOLECULE_IDS.join(', ')}. Renders a central atom bonded to one or more outer atoms with overlapping electron shells; the student places dot/cross symbols into each blanked bonding-pair and lone-pair slot.`,
  paramDocs: `stringParams: [{key:'moleculeId', value: one of ${COVALENT_MOLECULE_IDS.join('|')}}]`,
  blankablePartIds: [],
  blankableSlotIds: [],
  blankableConnectionKeys: [],
  parseParams: (selection) => {
    const moleculeId = enumParam(selection, 'moleculeId', COVALENT_MOLECULE_IDS);
    return moleculeId ? { moleculeId } : null;
  },
  build: (params) => {
    const molecule = COVALENT_MOLECULE_LIBRARY[params.moleculeId];
    const central = { x: 50, y: 50 };
    const bondAngles = evenlySpacedAngles(molecule.bonds.length, -90, 360);

    const primitives = [
      makePrimitive({ kind: 'circle', cx: central.x, cy: central.y, r: CENTRAL_R, stroke: 'currentColor', fill: 'none', strokeWidth: 0.6 }),
      symbolPrimitive(central.x, central.y, molecule.centralSymbol),
    ];
    const slots = [];

    // Central atom's own lone pairs
    for (const [i, angle] of lonePairAngles(bondAngles, molecule.centralLonePairs).entries()) {
      const point = pointOnCircle(central.x, central.y, CENTRAL_R - 2.5, angle);
      const tangent = perpendicular(unitVector(central, point));
      slots.push(
        makeSlot({ id: `central-lone${i}-a`, ...addScaled(point, tangent, -LONE_PAIR_HALF_GAP), paletteId: 'dot-cross', correctOption: 'dot', description: `Lone pair on ${molecule.centralSymbol}` }),
        makeSlot({ id: `central-lone${i}-b`, ...addScaled(point, tangent, LONE_PAIR_HALF_GAP), paletteId: 'dot-cross', correctOption: 'dot', description: `Lone pair on ${molecule.centralSymbol}` })
      );
    }

    molecule.bonds.forEach((bond, i) => {
      const bondAngle = bondAngles[i];
      const distance = CENTRAL_R + OUTER_R - OVERLAP_DEPTH;
      const outerCenter = pointOnCircle(central.x, central.y, distance, bondAngle);
      primitives.push(
        makePrimitive({ kind: 'circle', cx: outerCenter.x, cy: outerCenter.y, r: OUTER_R, stroke: 'currentColor', fill: 'none', strokeWidth: 0.6 }),
        symbolPrimitive(outerCenter.x, outerCenter.y, bond.outerSymbol)
      );

      const axis1 = unitVector(central, outerCenter);
      const axis2 = perpendicular(axis1);
      // Centre of the lens-shaped overlap between the two shells. Shared electrons sit here and are
      // offset ACROSS the overlap (along axis2, parallel to the lens) so a bonding pair reads as
      // sitting in the bond; multiple bonds stack their pairs along the bond axis (axis1).
      const bondCenter = addScaled(central, axis1, CENTRAL_R - OVERLAP_DEPTH / 2);
      for (let pair = 0; pair < bond.bondOrder; pair += 1) {
        const radialOffset = (pair - (bond.bondOrder - 1) / 2) * PAIR_RADIAL_SPACING;
        const pairCenter = addScaled(bondCenter, axis1, radialOffset);
        // The two electrons of a shared pair are interchangeable positions (one dot, one cross, in
        // either order); a multiple bond's pairs share the group so its dots/crosses can sit in any
        // of the bond's overlap positions.
        slots.push(
          makeSlot({ id: `bond${i}-pair${pair}-dot`, ...addScaled(pairCenter, axis2, -PAIR_TANGENT_HALF_GAP), paletteId: 'dot-cross', correctOption: 'dot', group: `bond${i}`, description: `Shared electron from ${molecule.centralSymbol}` }),
          makeSlot({ id: `bond${i}-pair${pair}-cross`, ...addScaled(pairCenter, axis2, PAIR_TANGENT_HALF_GAP), paletteId: 'dot-cross', correctOption: 'cross', group: `bond${i}`, description: `Shared electron from ${bond.outerSymbol}` })
        );
      }

      for (const [j, angle] of lonePairAngles([bondAngle + 180], bond.outerLonePairs).entries()) {
        const point = pointOnCircle(outerCenter.x, outerCenter.y, OUTER_R - LONE_PAIR_OFFSET, angle);
        const tangent = perpendicular(unitVector(outerCenter, point));
        slots.push(
          makeSlot({ id: `outer${i}-lone${j}-a`, ...addScaled(point, tangent, -LONE_PAIR_HALF_GAP), paletteId: 'dot-cross', correctOption: 'cross', description: `Lone pair on ${bond.outerSymbol}` }),
          makeSlot({ id: `outer${i}-lone${j}-b`, ...addScaled(point, tangent, LONE_PAIR_HALF_GAP), paletteId: 'dot-cross', correctOption: 'cross', description: `Lone pair on ${bond.outerSymbol}` })
        );
      }
    });

    return { title: `Dot-and-cross diagram: ${molecule.name}`, primitives, nodes: [], connections: [], slots, labelBank: [] };
  },
};

dotAndCrossCovalent.blankableSlotIds = Object.entries(COVALENT_MOLECULE_LIBRARY).flatMap(([, molecule]) => {
  const ids: string[] = [];
  for (let i = 0; i < molecule.centralLonePairs; i += 1) ids.push(`central-lone${i}-a`, `central-lone${i}-b`);
  molecule.bonds.forEach((bond, i) => {
    for (let pair = 0; pair < bond.bondOrder; pair += 1) ids.push(`bond${i}-pair${pair}-dot`, `bond${i}-pair${pair}-cross`);
    for (let j = 0; j < bond.outerLonePairs; j += 1) ids.push(`outer${i}-lone${j}-a`, `outer${i}-lone${j}-b`);
  });
  return ids;
});

export const DOT_AND_CROSS_TEMPLATES = [dotAndCrossIonic, dotAndCrossCovalent];
