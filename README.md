# Polaroid

A local-first vintage camera and photographic scrapbook using the original React, TypeScript and Vite stack. The initial screen is the camera; filters, adjustments, the gallery and optional layouts open from compact controls. There is no landing page or mandatory layout selection.

## Photography

Switch front/rear cameras, swipe to change filters, adjust intensity, keep or retake captures, mute the original shutter sound, and import photographs. The front preview and capture use matching mirroring. Captures use source-camera resolution, cropped to match the viewfinder, rather than saving the small preview canvas. Desktop access is supported without a decorative loading delay.

Live video requests 30 FPS at 1080p rather than forcing a 4K stream. An unfiltered view uses the browser's video compositor directly. Filtered video uses reusable WebGL2 shaders and video-frame callbacks, with adaptive preview resolution on slow/software GPUs. An OffscreenCanvas worker is the fallback, with at most one frame in flight. Background tabs stop processing. The source photo is captured independently; the sensor's still-photo API is used when available, with source-video capture as a fallback. Downloads retain the full-resolution processing path.

The shutter sample is preloaded and decoded. Sound and flash start in the shutter gesture, before image capture/encoding, and leading audio silence is skipped. Filter thumbnails decode their source once, render lazily during idle time, and refresh only while the filter shelf is open.

The filter browser offers search, horizontal live-image thumbnails, categories and persistent favorites. Optional controls cover exposure, contrast, saturation, temperature, tint, highlights, shadows, grain, fade, sharpness, vignette, bloom, halation, dust and light leaks. Changing a look does not overwrite the source photograph.

## 133 looks

All **12 original filters** remain: No Filter, Nashville, Chief Keef, Nuke, Preshboy, Sepia, 2014, $$$, Pandora, Bleach Bypass, Stressor and BnW. Their lookup tables, monochrome weights, grain amplitudes and vignette configurations are preserved. The displayed spelling is corrected while the saved identifier `bleachbypss` remains unchanged. Grain has a reproducible distribution to avoid editing flicker.

**121 additional creative looks** cover film stocks, instant color, early digital cameras and phones, disposable cameras, cinema, black-and-white printing and experimental processes. Categories: Original, Existing, Film, Instant, Digital, Disposable, Cinematic, Black & White and Experimental.

The renderers share preset definitions for tone curves, saturation, split-toning, highlight/shadow response, luminance-weighted grain, selective highlight glow, red halation, optical falloff and specific print effects. Live GPU grades are tested against the full-quality image renderer. Digital presets use limited detail, quantized color, sensor noise, sharpening, clipped tonality and flash response. Effects are chosen per look. These are artistic interpretations, not licensed, calibrated or exact stock/camera reproductions.

Manufacturer research informed the grade directions:

- [Kodak still film](https://www.kodak.com/en/still-film/products/) and [Kodak Professional color film](https://www.kodakprofessional.com/en-gb/photographers/film/color)
- [Fujifilm simulations and image-quality controls](https://fujifilm-dsc.com/en/manual/x-t5/menu_shooting/image_quality_setting/)
- [CineStill technical FAQ](https://cinestillfilm.com/pages/frequently-asked-questions)
- [ILFORD film families](https://www.ilfordphoto.com/choosing-your-first-ilford-film/)
- [Polaroid SX-70](https://support.polaroid.com/hc/en-us/articles/115012463268-Polaroid-SX-70-series-cameras)
- [Canon PowerShot A70](https://global.canon/en/c-museum/product/dcc484.html) and [Sony DSC-W55](https://www.sony.co.uk/electronics/support/compact-cameras-dsc-w-series/dsc-w55/specifications)

## Optional layout studio

| Layout             | Photos | Design                                                                                            |
| ------------------ | -----: | ------------------------------------------------------------------------------------------------- |
| Bali Postcards     |      5 | Staggered overlapping travel prints, white edges, contact shadows and a typewriter note           |
| Mixtape Memories   |      3 | Layered instant prints, an original cassette with editable label, handwriting and a flower        |
| Joyride Journal    |      2 | A portrait editorial page, cursive heading, stacked landscape photos, margin labels and a caption |
| Handwritten Moment |      1 | A clean landscape print above a large multiline handwritten message                               |

Each layout is implemented independently from the written descriptions. The four reference-image files were not supplied with the brief. Selection previews use bundled sample photos; actual drafts begin with empty slots and never include sample content automatically.

Mix saved photographs, uploads and new captures in any layout. Captures show their destination and require acceptance. Replace, remove, reuse, reorder, crop, pan and zoom each photograph. Scattered prints also have bounded rotation, position and scale adjustments plus an arrangement reset. Choose one look for every slot or independent treatments. Switching pages or layouts keeps photographs and saved drafts.

Edit every text field independently. Thirty original phrases in ten categories, manual line breaks, automatic wrapping/fitting, font, size, ink, alignment, line spacing and letter spacing are supported. Bundled fonts: Caveat, La Belle Aurore, Courier Prime, DM Sans and Nanum Pen Script. Korean handwriting falls back to Nanum Pen Script; other scripts use system fallbacks. Export waits for the actual text's fonts to load.

## Storage and privacy

Images live in IndexedDB as blobs, with an equivalent binary-buffer fallback for browsers that cannot persist native Blob/File objects. Drafts retain source references and non-destructive settings. The gallery separates photographs, drafts and finished compositions, with viewing, keyboard/swipe navigation, downloads, reuse and deliberate deletion. Photos referenced by drafts must be removed from those drafts before deletion.

The original `digicam_photos` localStorage gallery migrates atomically and idempotently. The old content remains as a recovery backup. Migration failures are reported without silently discarding old photos. Legacy images already contain their applied filter; unavailable pre-filter originals cannot be reconstructed. Preferences use localStorage. Storage, import, decoding, permission and export errors are surfaced.

No account, backend, analytics or automatic external photograph upload is added. Fonts, icons and samples are bundled. Object URLs and camera streams are released when no longer needed. Download backups: browser/device cleanup can erase local data; private browsing may not retain it. Each browser and origin has a separate collection.

JPEG, PNG, WebP, GIF and AVIF imports depend on browser decoding support, with EXIF orientation respected. HEIC/HEIF may need conversion to JPEG. Files over 80 MB or decoded images over 100 megapixels are rejected with an explanation.

## Downloads

Download a photograph alone, with the original date/signature Polaroid treatment, or as a completed layout. Instant-film color does not force a frame. Preview and export share one Canvas renderer for photographs, text, paper, frames, rotations, shadows and cassette details; editor controls are not exported.

Choose lossless PNG or high-quality JPEG, an editable filename, and 1600/3000/4000-pixel widths. Single-photo exports do not upscale beyond the source. Original-size output supports up to 6000 pixels wide and a 32-megapixel image area. Incomplete layouts remain editable drafts and cannot be exported as finished images. Finished compositions can also be saved to the gallery.

## Development and tests

Use Node 22.12+ and npm (tested with Node 22.18):

```sh
npm ci
npm run dev
npm run build
npm run lint
npx playwright install chromium firefox webkit
npm test
```

`npm run test:chromium` runs Chromium only. Playwright uses isolated profiles and port 5174. The suite checks original-filter compatibility, all preset outputs and zero-intensity recovery, imports and EXIF orientation, favorites, simulated high-resolution capture/mirroring, retakes, mixed-source photo-slot workflows, typography, PNG/JPEG downloads, drafts, migration, complete-layout rendering and preview/export agreement, errors and responsive overflow. Camera regressions check delivered-frame throughput, GPU/export color agreement, worker fallback, shutter timing during slow encoding, and independent still-photo resolution. Simulation checks the application pipeline; it does not certify physical cameras or every mobile device. On Windows, WebKit lacks the canvas camera-stream synthesis API, so its simulation-dependent camera tests skip; storage, imports, layouts and downloads are still tested there.

Camera access needs HTTPS in production or localhost in development. The development server binds to localhost. `HTTPS=true` enables the optional SSL plugin for a trusted development certificate setup; another device also needs an appropriate Vite host setting. Do not bypass certificate warnings; use a trusted certificate or HTTPS deployment.

The original-filter fixture was independently generated from commit `191f885` before refactoring. Presets, original curves, processing, layouts, export artwork and storage are separate modules under `src/lib`; reusable UI components live in `src/components`. `DESIGN.md` preserves the owner's interface rules.

Font and Lucide license notices ship in `public/licenses`. Preview-only photos use the [Unsplash license](https://unsplash.com/license), with image IDs `1476514525535-07fb3b4ae5f1`, `1518837695005-2083093ee35b`, `1464822759023-fed622ff2c3b`, `1441974231531-c6227db76b6e` and `1500530855697-b586d89ba3ee`.
