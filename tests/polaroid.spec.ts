import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const legacy = JSON.parse(
  readFileSync(
    new URL("./fixtures/legacy-filters.json", import.meta.url),
    "utf8",
  ),
);
const upload = async (page: Page, name = "lake") => {
  await page
    .locator("input[type=file]")
    .setInputFiles(`public/samples/${name}.jpg`);
  await expect(
    page.getByRole("status").filter({ hasText: "added to your collection" }),
  ).toBeVisible();
};
const chooseLayout = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(`Choose ${name},`) })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
};
const openSlot = async (page: Page, index: number) => {
  await page
    .getByRole("button", {
      name: `Select photo slot ${index + 1}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Choose photo", exact: true }).click();
};

test("preserves every original color table and configuration byte-for-byte", async ({
  page,
}) => {
  await page.goto("/");
  const actual = await page.evaluate(async () => {
    const { LEGACY_FILTERS } = await import("/src/lib/legacyFilters.ts");
    return JSON.parse(
      JSON.stringify(LEGACY_FILTERS, (_k, v) =>
        v instanceof Uint8Array ? Array.from(v) : v,
      ),
    );
  });
  expect(actual).toEqual(
    legacy.map((f: { name: string }) => ({
      ...f,
      name: f.name === "Bleach Bypss" ? "Bleach Bypass" : f.name,
    })),
  );
});

test("all 133 presets render and intensity zero exactly recovers the original", async ({
  page,
}) => {
  await page.goto("/");
  const report = await page.evaluate(async () => {
    const { FILTERS } = await import("/src/lib/filters.ts"),
      { canvasOf, contextOf, processCanvas } =
        await import("/src/lib/processing.ts"),
      { originalTreatment } = await import("/src/lib/types.ts");
    const source = canvasOf(192, 128),
      ctx = contextOf(source),
      frame = ctx.createImageData(192, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 192; x++) {
        const i = (y * 192 + x) * 4;
        frame.data[i] = (x / 191) * 255;
        frame.data[i + 1] = (y / 127) * 255;
        frame.data[i + 2] = (x + y) % 256;
        frame.data[i + 3] = 255;
      }
    ctx.putImageData(frame, 0, 0);
    const base = Array.from(frame.data),
      hashes: string[] = [],
      failed: string[] = [],
      zeros: string[] = [];
    for (const f of FILTERS) {
      const c = canvasOf(192, 128);
      contextOf(c).drawImage(source, 0, 0);
      processCanvas(
        c,
        { ...originalTreatment(), filterId: f.id },
        "2026-07-04",
      );
      const data = contextOf(c).getImageData(0, 0, 192, 128).data;
      let hash = 2166136261;
      for (const v of data) hash = Math.imul(hash ^ v, 16777619);
      hashes.push(`${hash}`);
      if (!data.some((v, i) => i % 4 !== 3 && v > 0)) failed.push(f.name);
      const zero = canvasOf(192, 128);
      contextOf(zero).drawImage(source, 0, 0);
      processCanvas(zero, {
        ...originalTreatment(),
        filterId: f.id,
        intensity: 0,
      });
      if (
        contextOf(zero)
          .getImageData(0, 0, 192, 128)
          .data.some((v, i) => v !== base[i])
      )
        zeros.push(f.name);
    }
    return {
      total: FILTERS.length,
      ids: new Set(FILTERS.map((f) => f.id)).size,
      uniqueOutputs: new Set(hashes).size,
      failed,
      zeros,
    };
  });
  expect(report).toEqual({
    total: 133,
    ids: 133,
    uniqueOutputs: 133,
    failed: [],
    zeros: [],
  });
});

test("single-photo import, search, favorites, original recovery and PNG/JPEG downloads", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search filters" })
    .fill("Portra 400");
  await page
    .getByRole("button", { name: "Apply Portra 400", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply Portra 400", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Favorite Portra 400", exact: true })
    .click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Apply Portra 400", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  await page.getByRole("slider", { name: /Intensity/ }).fill("0");
  await expect(page.getByRole("slider", { name: /Intensity/ })).toHaveValue(
    "0",
  );
  await page
    .getByRole("button", { name: "Back to original", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "No Filter" })).toBeVisible();
  await page.getByRole("button", { name: "Close Adjust photo" }).click();
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Download" });
  await dialog.getByLabel("File name").fill("test-memory");
  await dialog.getByLabel("Image size").selectOption("original");
  await dialog.getByLabel("Polaroid frame").uncheck();
  const pngPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download image", exact: true })
    .click();
  const png = await pngPromise;
  expect(png.suggestedFilename()).toBe("test-memory.png");
  expect(
    readFileSync((await png.path())!)
      .subarray(1, 4)
      .toString(),
  ).toBe("PNG");
  await dialog
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("jpeg");
  await dialog.getByLabel("Polaroid frame").check();
  const jpgPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download image", exact: true })
    .click();
  const jpg = await jpgPromise;
  expect(jpg.suggestedFilename()).toBe("test-memory.jpg");
  expect(readFileSync((await jpg.path())!)[0]).toBe(255);
});

test("four optional layouts require exactly 5, 3, 2 and 1 photos and retain unfinished drafts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Camera workspace" }),
  ).toBeVisible();
  for (const [name, count] of [
    ["Bali Postcards", 5],
    ["Mixtape Memories", 3],
    ["Joyride Journal", 2],
    ["Handwritten Moment", 1],
  ] as const) {
    await chooseLayout(page, name);
    await expect(
      page.getByRole("button", { name: /^Select photo slot/ }),
    ).toHaveCount(count);
    await expect(
      page.getByRole("button", { name: "Download composition" }),
    ).toBeDisabled();
    await expect(
      page.getByText(`This layout needs ${count}`, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Saved on this device", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "All layouts", exact: true })
      .click();
  }
  await page.reload();
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await page.getByRole("button", { name: "Continue draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Handwritten Moment", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Gallery 0" }).click();
  await page.getByRole("button", { name: /Saved drafts/ }).click();
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(4);
});

test("mixed upload and gallery slots, independent crops and looks, reorder, text and composition exports", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "lake");
  await chooseLayout(page, "Bali Postcards");
  for (let i = 0; i < 5; i++) {
    await openSlot(page, i);
    if (i === 1) {
      const chooser = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: "Upload a photo", exact: true })
        .click();
      await (await chooser).setFiles("public/samples/sea.jpg");
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "added to your collection" }),
      ).toBeVisible();
    } else
      await page.getByRole("button", { name: "Use lake", exact: true }).click();
  }
  await expect(
    page.getByRole("button", { name: "Download composition" }),
  ).toBeEnabled();
  await page.getByRole("slider", { name: /Crop zoom/ }).fill("1.6");
  await page.getByRole("slider", { name: /Crop horizontal/ }).fill("40");
  await page.getByRole("textbox", { name: "Search filters" }).fill("Tri-X");
  await page
    .getByRole("button", { name: "Apply Tri-X 400", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select photo slot 1", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "No Filter" })).toBeVisible();
  await page.getByLabel("Use the same look").check();
  await page.getByRole("slider", { name: /Intensity/ }).fill("63");
  await page
    .getByRole("button", { name: "Select photo slot 2", exact: true })
    .click();
  await expect(page.getByRole("slider", { name: /Intensity/ })).toHaveValue(
    "63",
  );
  await page.getByLabel("Use the same look").uncheck();
  await page.getByRole("button", { name: "Move photo earlier" }).click();
  await page.getByRole("button", { name: "Words", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your words", exact: true })
    .fill("we were happy here\n우리의 여름\nA little piece of forever.");
  await page.getByLabel("Handwriting & type").selectOption("Caveat");
  await page
    .getByRole("button", { name: "this one stays with me", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your words", exact: true }),
  ).toHaveValue("this one stays with me");
  await page.getByRole("button", { name: "Download composition" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Image size").selectOption("1600");
  const dl = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download image", exact: true })
    .click();
  const download = await dl;
  const data = readFileSync((await download.path())!);
  expect(data.readUInt32BE(16)).toBe(1600);
  expect(data.readUInt32BE(20)).toBe(1200);
  await dialog
    .getByRole("button", { name: "Save finished composition" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Saved to collection" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close Download" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await page.getByRole("button", { name: "Continue draft" }).click();
  await expect(
    page.getByRole("button", { name: "Download composition" }),
  ).toBeEnabled();
});

test("safe, idempotent migration retains existing photos and original localStorage backup", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 20;
    c.height = 30;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ad672e";
    ctx.fillRect(0, 0, 20, 30);
    localStorage.setItem(
      "digicam_photos",
      JSON.stringify([
        {
          id: "legacy-one",
          dataUrl: c.toDataURL(),
          takenAt: "2025-01-01T10:00:00Z",
        },
      ]),
    );
    const request = indexedDB.open("polaroid-darkroom", 1);
    await new Promise<void>((resolve) => {
      request.onsuccess = () => {
        const tx = request.result.transaction("meta", "readwrite");
        tx.objectStore("meta").delete("legacy-migrated");
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Gallery 1" })).toBeVisible();
  await page.getByRole("button", { name: "Gallery 1" }).click();
  await expect(
    page.getByRole("button", { name: "View From your original gallery" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Gallery 1" })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("digicam_photos")),
  ).toContain("legacy-one");
});

test("all layouts render complete artwork at preview and print resolutions with long Unicode text", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const report = await page.evaluate(async () => {
    const { LAYOUTS, createDraft } = await import("/src/lib/layouts.ts"),
      { originalTreatment } = await import("/src/lib/types.ts"),
      { renderComposition } = await import("/src/lib/render.ts");
    const photos = await Promise.all(
      ["lake", "sea", "mountain", "forest", "summer"].map(async (name, i) => {
        const blob = await (await fetch(`/samples/${name}.jpg`)).blob();
        return {
          id: `${i}`,
          blob,
          thumbnail: blob,
          name,
          width: 0,
          height: 0,
          url: "",
          thumbnailUrl: "",
          takenAt: "2026-07-04",
          kind: "upload",
          treatment: originalTreatment(),
        };
      }),
    );
    const result = [];
    for (const l of LAYOUTS) {
      const d = createDraft(l.id);
      d.slots.forEach((s, i) => {
        s.photoId = `${i}`;
        s.filterId = i % 2 ? "portra-400" : "acros";
      });
      const t = l.texts[0].id;
      d.texts[t].value =
        "우리의 여름\nSomewhere between then and now\n" +
        "a little piece of yesterday ".repeat(12);
      const preview = await renderComposition(d, photos, 800),
        high = await renderComposition(d, photos, 2400),
        reduced = document.createElement("canvas");
      reduced.width = preview.width;
      reduced.height = preview.height;
      reduced
        .getContext("2d")!
        .drawImage(high, 0, 0, reduced.width, reduced.height);
      const a = preview
          .getContext("2d")!
          .getImageData(0, 0, preview.width, preview.height).data,
        b = reduced
          .getContext("2d")!
          .getImageData(0, 0, reduced.width, reduced.height).data;
      let diff = 0;
      for (let i = 0; i < a.length; i += 4)
        diff +=
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
      result.push({
        id: l.id,
        width: high.width,
        height: high.height,
        diff: diff / ((a.length / 4) * 3),
        data: preview.toDataURL(),
      });
    }
    return result;
  });
  for (const r of report) {
    expect(r.width).toBe(2400);
    expect(r.height).toBeGreaterThan(1000);
    expect(r.diff).toBeLessThan(9);
    await testInfo.attach(`${r.id}-render`, {
      body: Buffer.from(r.data.split(",")[1], "base64"),
      contentType: "image/png",
    });
  }
});

test("responsive camera, layouts and keyboard dialog navigation have no horizontal overflow", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("region", { name: "Camera workspace" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: testInfo.outputPath(`camera-${width}.png`),
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Choose Bali/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("layout-picker-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Choose Handwritten/ }).click();
  await openSlot(page, 0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("camera permission errors give actionable recovery without fake captures", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByText("Camera access is blocked.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
});

test("camera captures native resolution, mirrors front photos, supports retake and fills only its intended slot", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLVideoElement.prototype.play;
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const c = document.createElement("canvas");
        c.width = 1920;
        c.height = 1080;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#e42211";
        ctx.fillRect(0, 0, 960, 1080);
        ctx.fillStyle = "#1244ee";
        ctx.fillRect(960, 0, 960, 1080);
        return c.captureStream(15);
      },
    });
    HTMLVideoElement.prototype.play = function () {
      return original.call(this);
    };
  });
  await page.goto("/");
  test.skip(
    !(await page.evaluate(
      () => typeof HTMLCanvasElement.prototype.captureStream === "function",
    )),
    "This engine cannot synthesize a camera stream",
  );
  await upload(page);
  await chooseLayout(page, "Joyride Journal");
  await openSlot(page, 0);
  await page.getByRole("button", { name: "Use lake", exact: true }).click();
  await openSlot(page, 1);
  await page
    .getByRole("button", { name: "Take a new photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Photo 2 of 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Capture review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Keep photograph", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Joyride Journal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download composition" }),
  ).toBeEnabled();
  const data = await page.evaluate(async () => {
    const { records } = await import("/src/lib/storage.ts");
    const photos = await records("photos");
    const capture = photos.find((p) => p.kind === "capture");
    const bitmap = await createImageBitmap(capture.blob);
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, 2, 1);
    const pixels = Array.from(ctx.getImageData(0, 0, 2, 1).data);
    return {
      width: capture.width,
      height: capture.height,
      pixels,
      slots: (await records("drafts"))[0].slots.map((s) => s.photoId),
    };
  });
  expect(data.width).toBe(1440);
  expect(data.height).toBe(1080);
  expect(data.pixels[2]).toBeGreaterThan(data.pixels[0]);
  expect(new Set(data.slots).size).toBe(2);
});
