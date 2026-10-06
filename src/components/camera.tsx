import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

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

const pointCurve =
  (points: [number, number][]): Step => {
    const pts = points.map(
      ([x, y]) => [(x / 100) * 255, (y / 100) * 255] as [number, number]
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
    Math.round(steps.reduce((v, step) => clamp(step(v)), i))
  );

type ColorLut = { red: Uint8Array; green: Uint8Array; blue: Uint8Array };

type CameraFilter = {
  id: string;
  name: string;
  color?: ColorLut;
  monochrome?: Uint8Array;
  vignette?: number;
  grain?: number;
};

const NO_FILTER: CameraFilter = { id: "none", name: "No filter" };

const nashvilleLevels = levels(1.35, 235);
const nashvillePrimary = brightnessContrast(5, 53);
const nashvilleSecondary = brightnessContrast(-7, 32);

const NASHVILLE: CameraFilter = {
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

const CHIEF_KEEF: CameraFilter = {
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

const NUKE: CameraFilter = {
  id: "nuke",
  name: "Nuke",
  vignette: -4,
  grain: 18,
  color: {
    red: buildLut([
      exposure(0.70),
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
      exposure(0.70),
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
      exposure(0.70),
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

const PRESHBOY: CameraFilter = {
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

const SEPIA: CameraFilter = {
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

const FILTER_2014: CameraFilter = {
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

const MONEY: CameraFilter = {
  id: "money",
  name: "$$$",
  vignette: -4,
  grain: 8,
  color: {
    red: buildLut([
      exposure(0.20),
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
      exposure(0.20),
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
      exposure(0.20),
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

const PANDORA: CameraFilter = {
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

const BLEACH_BYPASS: CameraFilter = {
  id: "bleachbypss",
  name: "Bleach Bypss",
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

const STRESSOR: CameraFilter = {
  id: "stressor",
  name: "Stressor",
  vignette: -6,
  color: {
    red: buildLut([
      exposure(-0.10),
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
      exposure(-0.10),
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
      exposure(-0.10),
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

const BNW: CameraFilter = {
  id: "bnw",
  name: "BnW",
  vignette: -5,
  monochrome: buildLut([
    exposure(-0.20),
    shadowZone(-13),
    shadowZone(-14),
    highlightZone(-7),
    highlightZone(7),
    bnwContrast,
    bnwToneCurve,
    bnwParamCurve,
  ]),
};

const FILTERS: CameraFilter[] = [
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

const SWIPE_DISTANCE = 40;
const MAX_SIDE = 800;

const coverRect = (vw: number, vh: number, cw: number, ch: number) => {
  const scale = Math.max(cw / vw, ch / vh);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
};

const applyColorAndEffects = (
  pixels: Uint8ClampedArray,
  color?: ColorLut,
  monochrome?: Uint8Array,
  grain?: number
) => {
  const grainScale = grain && grain > 0 ? grain * 0.45 : 0;

  if (monochrome) {
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const y = Math.round(0.38 * r + 0.48 * g + 0.14 * b);
      const val = monochrome[clamp(y)];
      const noise =
        grainScale > 0 ? (Math.random() - 0.5) * grainScale : 0;
      const finalVal = clamp(val + noise);
      pixels[i] = finalVal;
      pixels[i + 1] = finalVal;
      pixels[i + 2] = finalVal;
    }
    return;
  }

  const red = color?.red;
  const green = color?.green;
  const blue = color?.blue;

  if (red && green && blue) {
    if (grainScale > 0) {
      for (let i = 0; i < pixels.length; i += 4) {
        const noise = (Math.random() - 0.5) * grainScale;
        pixels[i] = clamp(red[pixels[i]] + noise);
        pixels[i + 1] = clamp(green[pixels[i + 1]] + noise);
        pixels[i + 2] = clamp(blue[pixels[i + 2]] + noise);
      }
    } else {
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = red[pixels[i]];
        pixels[i + 1] = green[pixels[i + 1]];
        pixels[i + 2] = blue[pixels[i + 2]];
      }
    }
  } else if (grainScale > 0) {
    for (let i = 0; i < pixels.length; i += 4) {
      const noise = (Math.random() - 0.5) * grainScale;
      pixels[i] = clamp(pixels[i] + noise);
      pixels[i + 1] = clamp(pixels[i + 1] + noise);
      pixels[i + 2] = clamp(pixels[i + 2] + noise);
    }
  }
};

const css = `
.cam-root {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.cam-source {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.cam-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.cam-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: #fff;
  font: 600 1.5rem system-ui, sans-serif;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
  opacity: 0;
  animation: cam-label-flash 1.8s ease-out;
}
.cam-label.slide-left {
  animation: cam-label-slide-left 1.8s ease-out;
}
.cam-label.slide-right {
  animation: cam-label-slide-right 1.8s ease-out;
}
@keyframes cam-label-flash {
  0% { opacity: 0; transform: scale(0.96); }
  15% { opacity: 1; transform: scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes cam-label-slide-left {
  0%  { opacity: 0; transform: translateX(28px); }
  14% { opacity: 1; transform: translateX(0); }
  70% { opacity: 1; transform: translateX(0); }
  100%{ opacity: 0; transform: translateX(-12px); }
}
@keyframes cam-label-slide-right {
  0%  { opacity: 0; transform: translateX(-28px); }
  14% { opacity: 1; transform: translateX(0); }
  70% { opacity: 1; transform: translateX(0); }
  100%{ opacity: 0; transform: translateX(12px); }
}
.cam-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  pointer-events: none;
  opacity: 0;
  animation: cam-flash-anim 0.45s ease-out forwards;
}
@keyframes cam-flash-anim {
  0%  { opacity: 0.85; }
  100%{ opacity: 0; }
}
.cam-fallback {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4da0b0, #d39d38);
}
.cam-blob {
  position: absolute;
  aspect-ratio: 1;
  filter: blur(40px);
  opacity: 0.75;
  border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
}
.cam-blob.one {
  width: 60%;
  top: -15%;
  left: -10%;
  background: #d39d38;
  animation: blob-one 12s ease-in-out infinite alternate;
}
.cam-blob.two {
  width: 55%;
  bottom: -20%;
  right: -10%;
  background: #4da0b0;
  animation: blob-two 14s ease-in-out infinite alternate;
}
.cam-blob.three {
  width: 40%;
  top: 30%;
  left: 35%;
  background: #e8c27a;
  animation: blob-three 10s ease-in-out infinite alternate;
}
@keyframes blob-one {
  to { transform: translate(45%, 35%) scale(1.2); border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; }
}
@keyframes blob-two {
  to { transform: translate(-50%, -30%) scale(1.15); border-radius: 70% 30% 40% 60% / 50% 60% 40% 50%; }
}
@keyframes blob-three {
  to { transform: translate(-40%, 40%) scale(0.8); border-radius: 40% 60% 60% 40% / 70% 30% 70% 30%; }
}
.cam-message {
  position: relative;
  z-index: 1;
  max-width: 80%;
  padding: 16px 20px;
  text-align: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  font-family: system-ui, sans-serif;
}
.cam-message h3 { margin: 0 0 6px; font-size: 1rem; }
.cam-message p { margin: 0; font-size: 0.875rem; line-height: 1.4; }
@media (prefers-reduced-motion: reduce) {
  .cam-blob { animation: none; }
  .cam-label, .cam-label.slide-left, .cam-label.slide-right { animation: cam-label-flash 1.8s ease-out; }
  .cam-flash { animation: none; }
}
`;

export interface CameraHandle {
  capture: () => string | null;
}

interface CameraProps {
  facingMode?: "user" | "environment";
  onCapture?: (dataUrl: string) => void;
}

const Camera = forwardRef<CameraHandle, CameraProps>(function Camera(
  { facingMode = "user", onCapture }: CameraProps,
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swipeStartX = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState(0);
  const [labelKey, setLabelKey] = useState(0);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  const onCaptureRef = useRef(onCapture);
  useEffect(() => { onCaptureRef.current = onCapture; }, [onCapture]);

  useImperativeHandle(ref, () => ({
    capture: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const dataUrl = canvas.toDataURL("image/png");
      setFlashKey((k) => k + 1);
      onCaptureRef.current?.(dataUrl);
      return dataUrl;
    },
  }));

  const filter = FILTERS[filterIndex];

  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const facingModeRef = useRef(facingMode);
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("The camera isn't available here. Open this page on localhost or https.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch((err: DOMException) => {
        if (err.name === "NotAllowedError") {
          setError("Camera access is blocked. Allow it from the lock icon next to the address bar, then reload.");
        } else if (err.name === "NotFoundError") {
          setError("We couldn't find a camera on this device.");
        } else {
          setError("Something went wrong starting the camera. Please try again.");
        }
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode]);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!root || !video || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const resize = () => {
      const { width, height } = root.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(window.devicePixelRatio || 1, MAX_SIDE / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();

    const drawFrame = () => {
      if (video.readyState < 2 || !video.videoWidth) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const { sx, sy, sw, sh } = coverRect(video.videoWidth, video.videoHeight, cw, ch);

      if (facingModeRef.current === "user") {
        ctx.setTransform(-1, 0, 0, 1, cw, 0);
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const { color, monochrome, vignette, grain } = filterRef.current;
      if (color || monochrome || grain) {
        const frame = ctx.getImageData(0, 0, cw, ch);
        applyColorAndEffects(frame.data, color, monochrome, grain);
        ctx.putImageData(frame, 0, 0);
      }

      if (vignette) {
        const strength = Math.abs(vignette) / 100;
        const maxAlpha = strength * 0.70;
        const cx = cw / 2;
        const cy = ch / 2;
        const halfDiag = Math.sqrt(cx * cx + cy * cy);
        const innerR = halfDiag * 0.45;
        const outerR = halfDiag * 1.05;
        const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
        const color_str = vignette < 0 ? `rgba(0,0,0,${maxAlpha.toFixed(3)})` : `rgba(255,255,255,${maxAlpha.toFixed(3)})`;
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, color_str);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
      }
    };

    const hasFrameCallback = "requestVideoFrameCallback" in video;
    let handle = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      drawFrame();
      handle = hasFrameCallback
        ? video.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };
    tick();

    return () => {
      stopped = true;
      observer.disconnect();
      if (hasFrameCallback) {
        video.cancelVideoFrameCallback(handle);
      } else {
        cancelAnimationFrame(handle);
      }
    };
  }, []);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipeStartX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (startX === null || error) return;

    const distance = e.clientX - startX;
    if (Math.abs(distance) < SWIPE_DISTANCE) return;

    const step = distance < 0 ? 1 : -1;
    const dir = distance < 0 ? 'left' : 'right';
    setFilterIndex((i) => (i + step + FILTERS.length) % FILTERS.length);
    setLabelKey((k) => k + 1);
    setSwipeDir(dir);
  };

  return (
    <div
      ref={rootRef}
      className="cam-root"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStartX.current = null;
      }}
    >
      <style>{css}</style>

      <video ref={videoRef} className="cam-source" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="cam-canvas" />

      {flashKey > 0 && <div key={flashKey} className="cam-flash" />}

      {error ? (
        <div className="cam-fallback">
          <div className="cam-blob one" />
          <div className="cam-blob two" />
          <div className="cam-blob three" />
          <div className="cam-message">
            <h3>Camera unavailable</h3>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <div
          key={labelKey}
          className={`cam-label${swipeDir === 'left' ? ' slide-left' : swipeDir === 'right' ? ' slide-right' : ''}`}
        >
          {filter.name}
        </div>
      )}
    </div>
  );
});

export default Camera;