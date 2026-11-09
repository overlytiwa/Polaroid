import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

test("photo picker restores keyboard focus when closed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose Handwritten Moment, 1 photos" })
    .click();
  const trigger = page.getByRole("button", {
    name: "Choose photo",
    exact: true,
  });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("Bali's fourth print overlaps its fifth print in the finished artwork", async ({
  page,
}) => {
  await page.goto("/");
  const pixel = await page.evaluate(async () => {
    const { createDraft } = await import("/src/lib/layouts.ts"),
      { originalTreatment } = await import("/src/lib/types.ts"),
      { renderComposition } = await import("/src/lib/render.ts");
    const photos = [];
    for (let i = 0; i < 5; i++) {
      const c = document.createElement("canvas");
      c.width = 100;
      c.height = 100;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = i === 3 ? "#ff0000" : i === 4 ? "#0000ff" : "#888888";
      ctx.fillRect(0, 0, 100, 100);
      const blob = await new Promise<Blob>((resolve) =>
        c.toBlob((blob) => resolve(blob!)),
      );
      photos.push({
        id: `${i}`,
        blob,
        thumbnail: blob,
        url: "",
        thumbnailUrl: "",
        width: 100,
        height: 100,
        name: `Photo ${i}`,
        kind: "upload",
        takenAt: "2026-07-04",
        treatment: originalTreatment(),
      });
    }
    const d = createDraft("bali");
    d.slots.forEach((s, i) => {
      s.photoId = `${i}`;
    });
    const c = await renderComposition(d, photos, 800);
    return Array.from(c.getContext("2d")!.getImageData(590, 333, 1, 1).data);
  });
  expect(pixel[0]).toBeGreaterThan(240);
  expect(pixel[2]).toBeLessThan(10);
});

test("a five-photo layout mixes gallery, uploads and camera without replacing other slots", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const c = document.createElement("canvas");
        c.width = 1920;
        c.height = 1080;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#98432e";
        ctx.fillRect(0, 0, c.width, c.height);
        return c.captureStream(15);
      },
    });
  });
  await page.goto("/");
  test.skip(
    !(await page.evaluate(
      () => typeof HTMLCanvasElement.prototype.captureStream === "function",
    )),
    "This engine cannot synthesize a camera stream",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles("public/samples/lake.jpg");
  await expect(
    page.getByRole("button", { name: "Gallery 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose Bali Postcards, 5 photos" })
    .click();
  const pick = async (slot: number) => {
    await page
      .getByRole("button", { name: `Select photo slot ${slot}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose photo", exact: true })
      .click();
  };
  await pick(1);
  await page.getByRole("button", { name: "Use lake", exact: true }).click();
  await pick(2);
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Upload a photo", exact: true })
    .click();
  await (await chooser).setFiles("public/samples/sea.jpg");
  await expect(page.getByText("2 / 5 photos", { exact: true })).toBeVisible();
  await pick(3);
  await page
    .getByRole("button", { name: "Take a new photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Keep photograph", exact: true })
    .click();
  await expect(page.getByText("3 / 5 photos", { exact: true })).toBeVisible();
  for (const i of [4, 5]) {
    await pick(i);
    await page.getByRole("button", { name: "Use lake", exact: true }).click();
  }
  await expect(
    page.getByRole("button", { name: "Download composition" }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { records } = await import("/src/lib/storage.ts");
        const [d] = await records("drafts"),
          photos = await records("photos");
        return d.slots.map((s) => photos.find((p) => p.id === s.photoId)?.kind);
      }),
    )
    .toEqual(["upload", "upload", "capture", "upload", "upload"]);
  // Deleting an image referenced by a draft is blocked rather than damaging the draft.
  await page.getByRole("button", { name: "Gallery 3", exact: true }).click();
  await page.getByRole("button", { name: "View lake", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete photograph", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from this device", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("draft");
  await expect(
    page.getByRole("button", { name: "Gallery 3", exact: true }),
  ).toBeVisible();
});

test("unsupported images fail clearly and EXIF rotation is respected", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await expect(
    page.getByRole("button", { name: "Gallery 0", exact: true }),
  ).toBeVisible();
  const dimensions = await page.evaluate(async () => {
    const { decode, release } = await import("/src/lib/processing.ts"),
      blob = await (await fetch("/samples/lake.jpg")).blob(),
      original = await decode(blob);
    const width = original.width,
      height = original.height;
    release(original);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const exif = new Uint8Array([
      0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1,
      0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const rotated = await decode(
      new Blob([bytes.slice(0, 2), exif, bytes.slice(2)], {
        type: "image/jpeg",
      }),
    );
    const result = {
      width,
      height,
      rotatedWidth: rotated.width,
      rotatedHeight: rotated.height,
    };
    release(rotated);
    return result;
  });
  expect(dimensions.rotatedWidth).toBe(dimensions.height);
  expect(dimensions.rotatedHeight).toBe(dimensions.width);
});

test("default artwork previews are rendered from photos, not fixed reference templates", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const images = await page.evaluate(async () => {
    const { LAYOUTS, createDraft } = await import("/src/lib/layouts.ts"),
      { originalTreatment } = await import("/src/lib/types.ts"),
      { renderComposition } = await import("/src/lib/render.ts");
    const photos = await Promise.all(
      ["lake", "sea", "forest", "mountain", "summer"].map(async (name, i) => {
        const blob = await (await fetch(`/samples/${name}.jpg`)).blob();
        return {
          id: `${i}`,
          blob,
          thumbnail: blob,
          url: "",
          thumbnailUrl: "",
          width: 0,
          height: 0,
          name,
          kind: "upload",
          takenAt: "2026-07-04",
          treatment: originalTreatment(),
        };
      }),
    );
    const output = [];
    for (const l of LAYOUTS) {
      const d = createDraft(l.id);
      d.slots.forEach((s, i) => {
        s.photoId = `${i}`;
        s.filterId = "portra-400";
      });
      output.push({
        name: l.id,
        png: (await renderComposition(d, photos, 1000)).toDataURL(),
      });
    }
    return output;
  });
  for (const image of images) {
    writeFileSync(
      testInfo.outputPath(`${image.name}.png`),
      Buffer.from(image.png.split(",")[1], "base64"),
    );
    await testInfo.attach(image.name, {
      body: Buffer.from(image.png.split(",")[1], "base64"),
      contentType: "image/png",
    });
  }
});

test("camera screen contains only photography controls", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const img = new Image();
        img.src = "/samples/lake.jpg";
        await img.decode();
        const c = document.createElement("canvas");
        c.width = 1600;
        c.height = 1200;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        return c.captureStream(15);
      },
    });
  });
  await page.goto("/");
  test.skip(
    !(await page.evaluate(
      () => typeof HTMLCanvasElement.prototype.captureStream === "function",
    )),
    "This engine cannot synthesize a camera stream",
  );
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeEnabled();
  await expect(
    page.locator("h1, footer, .eyebrow, .scrapbook-invitation"),
  ).toHaveCount(0);
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole("button", { name: "Filters", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Take photo", exact: true }),
    ).toBeInViewport();
    await expect
      .poll(() =>
        page
          .locator(".camera-surface")
          .evaluate(
            (element: HTMLElement) =>
              element.clientWidth > element.clientHeight,
          ),
      )
      .toBe(width > 700);
    await page.screenshot({
      path: testInfo.outputPath(`camera-interface-${width}.png`),
      fullPage: true,
    });
  }
});
