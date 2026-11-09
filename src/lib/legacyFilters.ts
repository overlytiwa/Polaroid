type Step = (v: number) => number;

const clamp = (v: number) => Math.min(255, Math.max(0, v));

const curveOutput =
  (out: number): Step =>
  (v) =>
    out + (v * (255 - out)) / 255;

const curveInput =
  (inp: number): Step =>
  (v) =>
    ((v - inp) * 255) / (255 - inp);

const levels =
  (midtones: number, highlights: number): Step =>
  (v) =>
    255 * Math.pow(Math.min(1, v / highlights), 1 / midtones);

const brightnessContrast =
  (brightness: number, contrast: number): Step =>
  (v) => {
    const slope = 1 + contrast / 100;
    let t = Math.pow(v / 255, Math.pow(2, -brightness / 100));
    t =
      t < 0.5
        ? 0.5 * Math.pow(2 * t, slope)
        : 1 - 0.5 * Math.pow(2 * (1 - t), slope);
    return t * 255;
  };

const multiply =
  (color: number): Step =>
  (v) =>
    (v * color) / 255;

const exposure =
  (stops: number): Step =>
  (v) =>
    v * Math.pow(2, stops);

const shadowZone =
  (amount: number): Step =>
  (v) => {
    const t = Math.max(0, 1 - v / 128);
    return v + amount * t * t;
  };

const highlightZone =
  (amount: number): Step =>
  (v) => {
    const t = Math.max(0, v / 128 - 1);
    return v + amount * t * t;
  };

const toneCurve =
  (highlights: number, lights: number, darks: number, shadows: number): Step =>
  (v) => {
    const n = v / 255;
    const wH = n * n;
    const wL = 4 * n * n * (1 - n);
    const wD = 4 * n * (1 - n) * (1 - n);
    const wS = (1 - n) * (1 - n);
    const shift =
      (highlights / 100) * wH * 20 +
      (lights / 100) * wL * 20 +
      (darks / 100) * wD * 20 +
      (shadows / 100) * wS * 20;
    return v + shift;
  };

const add =
  (amount: number): Step =>
  (v) =>
    v + amount;

const pointCurve = (points: [number, number][]): Step => {
  const pts = points.map(
    ([x, y]) => [(x / 100) * 255, (y / 100) * 255] as [number, number],
  );
  pts.sort((a, b) => a[0] - b[0]);
  return (v) => {
    if (v <= pts[0][0]) return pts[0][1];
    if (v >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      if (v >= x0 && v <= x1) {
        const t = (v - x0) / (x1 - x0);
        return y0 + (y1 - y0) * t;
      }
    }
    return v;
  };
};

const zoneTint =
  (shadowBias: number, midBias: number, highBias: number): Step =>
  (v) => {
    const n = v / 255;
    const wS = (1 - n) * (1 - n);
    const wM = 4 * n * (1 - n);
    const wH = n * n;
    return v + shadowBias * wS + midBias * wM + highBias * wH;
  };

const buildLut = (steps: Step[]): Uint8Array =>
  Uint8Array.from({ length: 256 }, (_, i) =>
    Math.round(steps.reduce((v, step) => clamp(step(v)), i)),
  );

type ColorLut = { red: Uint8Array; green: Uint8Array; blue: Uint8Array };

export type LegacyFilter = {
  id: string;
  name: string;
  color?: ColorLut;
  monochrome?: Uint8Array;
  vignette?: number;
  grain?: number;
};

const NO_FILTER: LegacyFilter = { id: "none", name: "No filter" };

const nashvilleLevels = levels(1.35, 235);
const nashvillePrimary = brightnessContrast(5, 53);
const nashvilleSecondary = brightnessContrast(-7, 32);

const NASHVILLE: LegacyFilter = {
  id: "nashville",
  name: "Nashville",
  color: {
    red: buildLut([
      nashvilleLevels,
      nashvillePrimary,
      nashvilleSecondary,
      multiply(250),
    ]),
    green: buildLut([
      curveOutput(35),
      nashvilleLevels,
      nashvillePrimary,
      curveInput(13),
      nashvilleSecondary,
      multiply(223),
    ]),
    blue: buildLut([
      curveOutput(133),
      nashvilleLevels,
      nashvillePrimary,
      curveInput(88),
      nashvilleSecondary,
      multiply(183),
    ]),
  },
};

const ckContrast = brightnessContrast(0, 18);
const ckToneCurve = toneCurve(18, 12, -18, -10);

const CHIEF_KEEF: LegacyFilter = {
  id: "chiefkeef",
  name: "Chief Keef",
  vignette: -18,
  color: {
    red: buildLut([
      exposure(0.05),
      add(8),
      add(-1),
      shadowZone(-10),
      shadowZone(-12),
      highlightZone(13),
      highlightZone(10),
      ckContrast,
      ckToneCurve,
      zoneTint(0, 2, 0),
      zoneTint(0, 3, 2),
      zoneTint(0, 2, 0),
      zoneTint(0, 3, 0),
      zoneTint(0, 0, 5),
      add(3),
    ]),
    green: buildLut([
      exposure(0.05),
      add(1),
      add(2),
      shadowZone(-7),
      shadowZone(-8),
      highlightZone(10),
      highlightZone(7),
      ckContrast,
      ckToneCurve,
      zoneTint(0, 1, 1),
      zoneTint(0, 3, 0),
      zoneTint(0, -3, 0),
      zoneTint(2, 0, 0),
      zoneTint(0, 2, 0),
      zoneTint(0, 0, 2),
      add(2),
    ]),
    blue: buildLut([
      exposure(0.05),
      add(-12),
      add(-1),
      shadowZone(-10),
      shadowZone(-18),
      highlightZone(4),
      highlightZone(2),
      ckContrast,
      ckToneCurve,
      zoneTint(0, 1, 0),
      zoneTint(0, -2, 0),
      zoneTint(0, -4, -4),
      zoneTint(1, 0, 0),
      add(-2),
    ]),
  },
};

const nukeContrast = brightnessContrast(0, 8);
const nukeToneCurve = toneCurve(8, 6, -5, -8);
const nukeParamCurve = toneCurve(4, 5, -4, -7);

const NUKE: LegacyFilter = {
  id: "nuke",
  name: "Nuke",
  vignette: -4,
  grain: 18,
  color: {
    red: buildLut([
      exposure(0.7),
      add(13),
      shadowZone(5),
      shadowZone(-5),
      highlightZone(-7),
      highlightZone(7),
      nukeContrast,
      nukeToneCurve,
      nukeParamCurve,
      zoneTint(0, 7, 4),
      zoneTint(3, 5, 9),
      add(3),
    ]),
    green: buildLut([
      exposure(0.7),
      add(-1),
      shadowZone(3),
      shadowZone(-4),
      highlightZone(-5),
      highlightZone(5),
      nukeContrast,
      nukeToneCurve,
      nukeParamCurve,
      zoneTint(-2, 1, 2),
      zoneTint(-2, 3, 5),
      add(-1),
    ]),
    blue: buildLut([
      exposure(0.7),
      add(-13),
      shadowZone(3),
      shadowZone(-6),
      highlightZone(-8),
      highlightZone(3),
      nukeContrast,
      nukeToneCurve,
      nukeParamCurve,
      zoneTint(0, -7, -8),
      zoneTint(5, -2, -4),
      add(-3),
    ]),
  },
};

const preshboyContrast = brightnessContrast(0, 12);
const preshboyToneCurve = toneCurve(-4, -3, -12, -18);

const PRESHBOY: LegacyFilter = {
  id: "preshboy",
  name: "Preshboy",
  vignette: -16,
  grain: 22,
  color: {
    red: buildLut([
      exposure(-0.35),
      add(6),
      shadowZone(-10),
      shadowZone(-8),
      highlightZone(-3),
      highlightZone(-4),
      preshboyContrast,
      preshboyToneCurve,
      zoneTint(-1, -2, -1),
      zoneTint(1, 2, 4),
    ]),
    green: buildLut([
      exposure(-0.35),
      add(-1),
      shadowZone(-9),
      shadowZone(-7),
      highlightZone(-3),
      highlightZone(-4),
      preshboyContrast,
      preshboyToneCurve,
      zoneTint(-3, -5, -3),
      zoneTint(3, 1, 2),
    ]),
    blue: buildLut([
      exposure(-0.35),
      add(-5),
      shadowZone(-11),
      shadowZone(-8),
      highlightZone(-4),
      highlightZone(-5),
      preshboyContrast,
      preshboyToneCurve,
      zoneTint(-2, -4, -5),
      zoneTint(-1, 0, -1),
    ]),
  },
};

const sepiaContrast = brightnessContrast(0, -4);

const SEPIA: LegacyFilter = {
  id: "sepia",
  name: "Sepia",
  vignette: -3,
  color: {
    red: buildLut([
      exposure(0.05),
      add(11),
      shadowZone(4),
      shadowZone(3),
      highlightZone(-3),
      highlightZone(-2),
      sepiaContrast,
      zoneTint(2, 4, 5),
      zoneTint(2, 3, 5),
      add(2),
    ]),
    green: buildLut([
      exposure(0.05),
      add(-1),
      shadowZone(3),
      shadowZone(2),
      highlightZone(-2),
      highlightZone(-2),
      sepiaContrast,
      zoneTint(1, 2, 3),
      zoneTint(3, 2, 3),
      add(1),
    ]),
    blue: buildLut([
      exposure(0.05),
      add(-10),
      shadowZone(1),
      shadowZone(1),
      highlightZone(-4),
      highlightZone(-3),
      sepiaContrast,
      zoneTint(-2, -3, -3),
      zoneTint(-2, -1, -3),
      add(-2),
    ]),
  },
};

const curve2014 = pointCurve([
  [0, 8],
  [15, 19],
  [30, 32],
  [45, 47],
  [60, 62],
  [75, 77],
  [90, 91],
  [100, 98],
]);
const contrast2014 = brightnessContrast(0, -7);

const FILTER_2014: LegacyFilter = {
  id: "2014",
  name: "2014",
  vignette: -3,
  color: {
    red: buildLut([
      exposure(0.55),
      add(9),
      shadowZone(9),
      shadowZone(7),
      highlightZone(-7),
      highlightZone(3),
      contrast2014,
      curve2014,
      zoneTint(0, 1, 2),
      zoneTint(-1, 2, 4),
      add(-1),
    ]),
    green: buildLut([
      exposure(0.55),
      add(-1),
      shadowZone(8),
      shadowZone(6),
      highlightZone(-6),
      highlightZone(2),
      contrast2014,
      curve2014,
      zoneTint(0, 2, 3),
      zoneTint(0, 1, 2),
      add(-2),
    ]),
    blue: buildLut([
      exposure(0.55),
      add(-7),
      shadowZone(10),
      shadowZone(7),
      highlightZone(-8),
      highlightZone(0),
      contrast2014,
      curve2014,
      zoneTint(1, -1, -2),
      zoneTint(3, -1, -2),
      add(-2),
    ]),
  },
};

const curveMoney = pointCurve([
  [0, 13],
  [10, 20],
  [25, 29],
  [50, 48],
  [75, 70],
  [90, 82],
  [100, 91],
]);
const contrastMoney = brightnessContrast(0, -12);

const MONEY: LegacyFilter = {
  id: "money",
  name: "$$$",
  vignette: -4,
  grain: 8,
  color: {
    red: buildLut([
      exposure(0.2),
      add(9),
      shadowZone(8),
      shadowZone(9),
      highlightZone(-7),
      highlightZone(-4),
      contrastMoney,
      curveMoney,
      shadowZone(2),
      zoneTint(7, 4, 10),
      add(2),
    ]),
    green: buildLut([
      exposure(0.2),
      add(-1),
      shadowZone(6),
      shadowZone(7),
      highlightZone(-6),
      highlightZone(-3),
      contrastMoney,
      curveMoney,
      shadowZone(-3),
      zoneTint(-4, 2, 6),
      add(-1),
    ]),
    blue: buildLut([
      exposure(0.2),
      add(-7),
      shadowZone(8),
      shadowZone(8),
      highlightZone(-8),
      highlightZone(-5),
      contrastMoney,
      curveMoney,
      shadowZone(2),
      zoneTint(9, -1, -3),
      add(-1),
    ]),
  },
};

const curvePandora = pointCurve([
  [0, 8],
  [10, 17],
  [20, 27],
  [30, 37],
  [40, 47],
  [50, 56],
  [60, 65],
  [70, 73],
  [80, 82],
  [90, 91],
  [100, 99],
]);
const contrastPandora = brightnessContrast(0, -12);

const PANDORA: LegacyFilter = {
  id: "pandora",
  name: "Pandora",
  vignette: -4,
  color: {
    red: buildLut([
      exposure(0.35),
      add(1),
      shadowZone(7),
      shadowZone(8),
      highlightZone(-3),
      highlightZone(1),
      contrastPandora,
      curvePandora,
      shadowZone(1),
      zoneTint(-3, 3, 5),
      add(-1),
    ]),
    green: buildLut([
      exposure(0.35),
      add(-3),
      shadowZone(6),
      shadowZone(7),
      highlightZone(-2),
      highlightZone(1),
      contrastPandora,
      curvePandora,
      shadowZone(-2),
      zoneTint(3, 2, 3),
      add(-1),
    ]),
    blue: buildLut([
      exposure(0.35),
      add(4),
      shadowZone(8),
      shadowZone(8),
      highlightZone(-4),
      highlightZone(0),
      contrastPandora,
      curvePandora,
      shadowZone(1),
      zoneTint(6, -1, -2),
      add(-1),
    ]),
  },
};

const bbContrast = brightnessContrast(0, 22);
const bbToneCurve = toneCurve(8, 6, -12, -18);

const BLEACH_BYPASS: LegacyFilter = {
  id: "bleachbypss",
  name: "Bleach Bypass",
  vignette: -5,
  color: {
    red: buildLut([
      exposure(-0.25),
      add(-5),
      shadowZone(-13),
      shadowZone(-11),
      highlightZone(7),
      highlightZone(6),
      bbContrast,
      bbToneCurve,
      zoneTint(-2, 0, 1),
      zoneTint(-2, 2, 3),
      add(-2),
    ]),
    green: buildLut([
      exposure(-0.25),
      add(-2),
      shadowZone(-12),
      shadowZone(-10),
      highlightZone(6),
      highlightZone(5),
      bbContrast,
      bbToneCurve,
      zoneTint(-3, -2, 0),
      zoneTint(2, 1, 2),
      add(-1),
    ]),
    blue: buildLut([
      exposure(-0.25),
      add(9),
      shadowZone(-14),
      shadowZone(-12),
      highlightZone(5),
      highlightZone(4),
      bbContrast,
      bbToneCurve,
      zoneTint(1, -2, -2),
      zoneTint(-1, 0, -1),
      add(-2),
    ]),
  },
};

const stressorContrast = brightnessContrast(0, 18);
const stressorCurve = pointCurve([
  [0, 0],
  [10, 1],
  [20, 4],
  [30, 9],
  [40, 13],
  [50, 19],
  [60, 33],
  [70, 61],
  [80, 80],
  [90, 95],
  [100, 100],
]);
const stressorRedCurve = pointCurve([
  [0, 0],
  [25, 23],
  [50, 49],
  [75, 77],
  [100, 100],
]);
const stressorGreenCurve = pointCurve([
  [0, 0],
  [25, 24],
  [50, 49],
  [75, 76],
  [100, 100],
]);
const stressorBlueCurve = pointCurve([
  [0, 0],
  [25, 26],
  [50, 51],
  [75, 77],
  [100, 100],
]);

const STRESSOR: LegacyFilter = {
  id: "stressor",
  name: "Stressor",
  vignette: -6,
  color: {
    red: buildLut([
      exposure(-0.1),
      add(-4),
      shadowZone(-13),
      shadowZone(-11),
      highlightZone(5),
      highlightZone(7),
      stressorContrast,
      stressorCurve,
      stressorRedCurve,
      zoneTint(-1, -1, 0),
      zoneTint(-1, 1, 2),
      add(-1),
    ]),
    green: buildLut([
      exposure(-0.1),
      add(-2),
      shadowZone(-12),
      shadowZone(-10),
      highlightZone(4),
      highlightZone(6),
      stressorContrast,
      stressorCurve,
      stressorGreenCurve,
      zoneTint(-2, -3, -2),
      zoneTint(1, 1, 1),
      add(-1),
    ]),
    blue: buildLut([
      exposure(-0.1),
      add(7),
      shadowZone(-14),
      shadowZone(-12),
      highlightZone(4),
      highlightZone(5),
      stressorContrast,
      stressorCurve,
      stressorBlueCurve,
      zoneTint(0, -2, -3),
      zoneTint(0, 0, -1),
      add(-1),
    ]),
  },
};

const bnwContrast = brightnessContrast(0, 28);
const bnwToneCurve = toneCurve(4, 8, -12, -8);
const bnwParamCurve = toneCurve(4, 8, -12, -8);

const BNW: LegacyFilter = {
  id: "bnw",
  name: "BnW",
  vignette: -5,
  monochrome: buildLut([
    exposure(-0.2),
    shadowZone(-13),
    shadowZone(-14),
    highlightZone(-7),
    highlightZone(7),
    bnwContrast,
    bnwToneCurve,
    bnwParamCurve,
  ]),
};

export const LEGACY_FILTERS: LegacyFilter[] = [
  NO_FILTER,
  NASHVILLE,
  CHIEF_KEEF,
  NUKE,
  PRESHBOY,
  SEPIA,
  FILTER_2014,
  MONEY,
  PANDORA,
  BLEACH_BYPASS,
  STRESSOR,
  BNW,
];
