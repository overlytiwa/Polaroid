import { LAYOUT_MAP } from "./layouts";
import {
  canvasOf,
  contextOf,
  cover,
  decode,
  processCanvas,
  release,
  toBlob,
} from "./processing";
import type { Draft, Photo, TextGeometry, TextStyle, Treatment } from "./types";
export async function waitForFonts() {
  await Promise.all(
    [
      "Caveat",
      "La Belle Aurore",
      "Courier Prime",
      "DM Sans",
      "Nanum Pen Script",
    ].map((font) => document.fonts.load(`24px "${font}"`)),
  );
  await document.fonts.ready;
}
function family(font: string, value: string) {
  return /[\uAC00-\uD7AF\u3130-\u318F]/.test(value) &&
    ["Caveat", "La Belle Aurore"].includes(font)
    ? '"Nanum Pen Script", sans-serif'
    : `"${font}", "Nanum Pen Script", sans-serif`;
}
const measured = (
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
) => ctx.measureText(text).width + Math.max(0, [...text].length - 1) * spacing;
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  spacing: number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (measured(ctx, line + word, spacing) <= width) line += word;
      else {
        if (line.trim()) lines.push(line.trimEnd());
        line = "";
        for (const char of [...word]) {
          if (line && measured(ctx, line + char, spacing) > width) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
function drawText(
  ctx: CanvasRenderingContext2D,
  box: TextGeometry,
  style: TextStyle,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  let size = style.size,
    lines: string[] = [];
  do {
    ctx.font = `${size}px ${family(style.font, style.value)}`;
    lines = wrapText(ctx, style.value, box.w - 6, style.letterSpacing);
    if (lines.length * size * style.lineHeight <= box.h - 8) break;
    size--;
  } while (size > 5);
  ctx.fillStyle = style.color;
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    const width = measured(ctx, line, style.letterSpacing);
    let x =
      box.x +
      (style.align === "center"
        ? (box.w - width) / 2
        : style.align === "right"
          ? box.w - width
          : 0);
    for (const char of [...line]) {
      ctx.fillText(char, x, box.y + 4 + index * size * style.lineHeight);
      x += ctx.measureText(char).width + style.letterSpacing;
    }
  });
  ctx.restore();
}
function cassette(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(1220, 680);
  ctx.rotate(-0.08);
  ctx.shadowColor = "rgba(32,30,25,.16)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#dddcd5";
  ctx.beginPath();
  ctx.roundRect(-260, -170, 520, 340, 23);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#b8b7af";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f8f6eb";
  ctx.beginPath();
  ctx.roundRect(-235, -146, 470, 223, 12);
  ctx.fill();
  ctx.fillStyle = "#bd5b44";
  ctx.fillRect(-234, -70, 468, 8);
  ctx.fillStyle = "#d3b779";
  ctx.fillRect(-234, -62, 468, 6);
  ctx.fillStyle = "#aaa99f";
  ctx.beginPath();
  ctx.roundRect(-190, -37, 380, 93, 32);
  ctx.fill();
  ctx.fillStyle = "#323533";
  ctx.beginPath();
  ctx.roundRect(-158, -18, 316, 54, 20);
  ctx.fill();
  for (const x of [-116, 116]) {
    ctx.fillStyle = "#f4f1e6";
    ctx.beginPath();
    ctx.arc(x, 10, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#82867f";
    ctx.beginPath();
    ctx.arc(x, 10, 13, 0, Math.PI * 2);
    ctx.fill();
    for (let j = 0; j < 6; j++) {
      ctx.save();
      ctx.translate(x, 10);
      ctx.rotate((j * Math.PI) / 3);
      ctx.fillRect(-4, -30, 8, 12);
      ctx.restore();
    }
  }
  ctx.fillStyle = "#c7c6bd";
  ctx.beginPath();
  ctx.moveTo(-175, 148);
  ctx.lineTo(-135, 91);
  ctx.lineTo(135, 91);
  ctx.lineTo(175, 148);
  ctx.closePath();
  ctx.fill();
  for (const x of [-224, 224])
    for (const y of [-132, 132]) {
      ctx.fillStyle = "#a2a49c";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.fillStyle = "#5d625a";
  ctx.font = '17px "DM Sans"';
  ctx.fillText("A", -211, -107);
  ctx.font = '12px "Courier Prime"';
  ctx.fillText("NORMAL BIAS  /  90 MIN", -108, 132);
  ctx.restore();
}
function decorations(ctx: CanvasRenderingContext2D, draft: Draft) {
  if (draft.layoutId === "bali") {
    ctx.save();
    ctx.translate(1590, 540);
    ctx.rotate(0.12);
    ctx.fillStyle = "#eeece7";
    ctx.fillRect(0, 0, 150, 400);
    ctx.restore();
  }
  if (draft.layoutId === "mixtape") {
    cassette(ctx);
    ctx.save();
    ctx.strokeStyle = "#748367";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1405, 1250);
    ctx.quadraticCurveTo(1400, 1200, 1430, 1148);
    ctx.stroke();
    ctx.strokeStyle = "#af796d";
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.ellipse(
        1430 + Math.cos(a) * 17,
        1148 + Math.sin(a) * 17,
        13,
        7,
        a,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.fillStyle = "#c8aa66";
    ctx.beginPath();
    ctx.arc(1430, 1148, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
export async function renderComposition(
  draft: Draft,
  photos: Photo[],
  width: number,
  placeholders = true,
): Promise<HTMLCanvasElement> {
  await waitForFonts();
  await Promise.all(
    Object.values(draft.texts).map((t) =>
      document.fonts.load(
        `${t.size}px ${family(t.font, t.value)}`,
        t.value || " ",
      ),
    ),
  );
  const layout = LAYOUT_MAP.get(draft.layoutId)!,
    scale = width / layout.width,
    canvas = canvasOf(width, layout.height * scale),
    ctx = contextOf(canvas);
  ctx.scale(scale, scale);
  ctx.fillStyle = draft.layoutId === "handwritten" ? "#fdfcf9" : "#f5f3ed";
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (draft.layoutId !== "handwritten") {
    ctx.fillStyle = "rgba(70,60,40,.025)";
    for (let i = 0; i < 4000; i++)
      ctx.fillRect(
        (((i * 719) % 1601) / 1601) * layout.width,
        (((i * 421) % 1409) / 1409) * layout.height,
        0.8,
        0.8,
      );
  }
  for (const i of layout.order ?? layout.slots.map((_, index) => index)) {
    const g = layout.slots[i],
      slot = draft.slots[i],
      photo = photos.find((p) => p.id === slot.photoId);
    ctx.save();
    ctx.translate(g.x + g.w / 2 + slot.x, g.y + g.h / 2 + slot.y);
    ctx.rotate(((g.rotation + slot.rotation) * Math.PI) / 180);
    ctx.scale(slot.scale, slot.scale);
    const left = -g.w / 2,
      top = -g.h / 2,
      border = g.border;
    if (border) {
      ctx.shadowColor = "rgba(30,27,22,.16)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = "#fefdf9";
      ctx.fillRect(
        left - border,
        top - border,
        g.w + border * 2,
        g.h + border + (g.bottom ?? border),
      );
      ctx.shadowColor = "transparent";
    }
    ctx.translate(left, top);
    if (photo) {
      const img = await decode(photo.blob);
      try {
        const detail = scale * slot.scale,
          render = canvasOf(g.w * detail, g.h * detail);
        cover(
          contextOf(render),
          img,
          img.width,
          img.height,
          render.width,
          render.height,
          slot.zoom,
          slot.panX,
          slot.panY,
        );
        processCanvas(render, slot, photo.takenAt);
        ctx.drawImage(render, 0, 0, g.w, g.h);
      } finally {
        release(img);
      }
    } else if (placeholders) {
      ctx.fillStyle = "#e7e6df";
      ctx.fillRect(0, 0, g.w, g.h);
      ctx.strokeStyle = "#d3d2c9";
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, g.w - 16, g.h - 16);
      ctx.fillStyle = "#8b8e82";
      ctx.font = `${Math.min(g.w / 9, 32)}px "Courier Prime"`;
      ctx.textAlign = "center";
      ctx.fillText(`PHOTO ${String(i + 1).padStart(2, "0")}`, g.w / 2, g.h / 2);
    }
    ctx.restore();
  }
  decorations(ctx, draft);
  for (const t of layout.texts) {
    ctx.save();
    if (draft.layoutId === "mixtape" && t.id === "cassette") {
      ctx.translate(1220, 680);
      ctx.rotate(-0.08);
      ctx.translate(-1220, -680);
    }
    drawText(ctx, t, draft.texts[t.id] ?? t.default);
    ctx.restore();
  }
  return canvas;
}
export async function renderPhoto(
  photo: Photo,
  treatment: Treatment,
  width: number | "original",
  frame = false,
) {
  await waitForFonts();
  const image = await decode(photo.blob);
  try {
    const max =
      width === "original"
        ? Math.min(
            image.width,
            6000,
            Math.sqrt((32_000_000 * image.width) / image.height),
          )
        : Math.min(width, image.width);
    const c = canvasOf(max, (max * image.height) / image.width);
    contextOf(c).drawImage(image, 0, 0, c.width, c.height);
    processCanvas(c, treatment, photo.takenAt);
    if (!frame) return c;
    const border = c.width * 0.12,
      head = c.width * 0.17,
      foot = c.width * 0.2,
      framed = canvasOf(c.width + border * 2, c.height + head + foot),
      ctx = contextOf(framed);
    ctx.fillStyle = "#fffefb";
    ctx.fillRect(0, 0, framed.width, framed.height);
    ctx.drawImage(c, border, head);
    ctx.fillStyle = "#282b27";
    ctx.font = `${c.width * 0.025}px "Courier Prime"`;
    ctx.textAlign = "right";
    const d = new Date(photo.takenAt);
    ctx.fillText(
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      border + c.width,
      head * 0.65,
    );
    ctx.textAlign = "left";
    ctx.fillText(d.toLocaleDateString(), border, c.height + head + foot * 0.44);
    ctx.textAlign = "right";
    ctx.fillText(
      "polaroid.overly.cc",
      border + c.width,
      c.height + head + foot * 0.44,
    );
    return framed;
  } finally {
    release(image);
  }
}
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  name: string,
  format: "png" | "jpeg",
) {
  let output = canvas;
  if (format === "jpeg") {
    output = canvasOf(canvas.width, canvas.height);
    const ctx = contextOf(output);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(canvas, 0, 0);
  }
  const blob = await toBlob(output, `image/${format}`, 0.96),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  const safeName = [...name]
    .map((c) => (c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? "-" : c))
    .join("")
    .trim();
  a.href = url;
  a.download = `${safeName || "polaroid-memory"}.${format === "jpeg" ? "jpg" : "png"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return blob;
}
