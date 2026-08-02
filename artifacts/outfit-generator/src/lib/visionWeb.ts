/**
 * visionWeb — extract dominant color names from a photo using a canvas.
 *
 * Algorithm:
 *  1. Draw the image into a 48×48 canvas.
 *  2. Sample 4×4 patches from each corner to detect the background color.
 *  3. Exclude pixels that match the background (within a tolerance of 30).
 *  4. Map surviving pixels to color names.
 *  5. Keep only colors that cover ≥10% of foreground pixels.
 *
 * Returns an array of color name strings.
 * Falls back to [] on any error (canvas not available, CORS, etc.).
 */

const CANVAS_SIZE = 48;
const CORNER_PATCH = 4;
const BG_TOLERANCE = 30;
const MIN_FOREGROUND_FRACTION = 0.10;

interface RGB { r: number; g: number; b: number }

function toBrightness({ r, g, b }: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function toColorName(p: RGB): string {
  const br = toBrightness(p);
  const { r, g, b } = p;

  if (br < 80)  return "black";
  if (br < 110) return "dark grey";
  if (br < 175) return "grey";
  if (br < 225) return "light grey";
  if (r > 230 && g > 210 && b > 180) return "white";

  // Beige / tan / brown family
  if (r > 180 && g > 140 && b > 90 && r > g && g > b) {
    if (br > 200) return "beige";
    if (br > 160) return "tan";
    return "brown";
  }

  // Hue-based
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta < 20) return br > 200 ? "white" : br > 120 ? "grey" : "black";

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  if (hue < 15  || hue >= 345) return "red";
  if (hue < 45)                return "orange";
  if (hue < 70)                return "yellow";
  if (hue < 150)               return "green";
  if (hue < 195)               return "teal";
  if (hue < 260)               return "blue";
  if (hue < 290)               return "purple";
  if (hue < 345)               return "pink";
  return "red";
}

function averagePatch(data: Uint8ClampedArray, x0: number, y0: number, size: number): RGB {
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = y0; y < y0 + size && y < CANVAS_SIZE; y++) {
    for (let x = x0; x < x0 + size && x < CANVAS_SIZE; x++) {
      const i = (y * CANVAS_SIZE + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      count++;
    }
  }
  return count > 0 ? { r: r / count, g: g / count, b: b / count } : { r: 255, g: 255, b: 255 };
}

export async function extractColorLabels(imageUrl: string): Promise<string[]> {
  try {
    return await new Promise<string[]>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = CANVAS_SIZE;
          canvas.height = CANVAS_SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve([]); return; }

          ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
          const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

          // Detect background from 4 corner patches
          const corners: RGB[] = [
            averagePatch(data, 0, 0, CORNER_PATCH),
            averagePatch(data, CANVAS_SIZE - CORNER_PATCH, 0, CORNER_PATCH),
            averagePatch(data, 0, CANVAS_SIZE - CORNER_PATCH, CORNER_PATCH),
            averagePatch(data, CANVAS_SIZE - CORNER_PATCH, CANVAS_SIZE - CORNER_PATCH, CORNER_PATCH),
          ];
          const bg: RGB = {
            r: corners.reduce((s, c) => s + c.r, 0) / 4,
            g: corners.reduce((s, c) => s + c.g, 0) / 4,
            b: corners.reduce((s, c) => s + c.b, 0) / 4,
          };

          // Collect foreground pixels
          const colorCounts = new Map<string, number>();
          let foregroundCount = 0;

          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 128) continue; // transparent

            const px: RGB = { r: data[i], g: data[i + 1], b: data[i + 2] };
            if (colorDistance(px, bg) < BG_TOLERANCE) continue; // background

            foregroundCount++;
            const name = toColorName(px);
            colorCounts.set(name, (colorCounts.get(name) ?? 0) + 1);
          }

          if (foregroundCount === 0) { resolve([]); return; }

          const threshold = foregroundCount * MIN_FOREGROUND_FRACTION;
          const result = [...colorCounts.entries()]
            .filter(([, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name);

          resolve(result);
        } catch {
          resolve([]);
        }
      };
      img.onerror = () => resolve([]);
      img.src = imageUrl;
    });
  } catch {
    return [];
  }
}
