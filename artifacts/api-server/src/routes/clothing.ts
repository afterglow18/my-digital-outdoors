import express, { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { db, clothingItemsTable, savedOutfitsTable, outfitItemsTable, CLOTHING_CATEGORIES } from "@workspace/db";
import {
  ListClothingQueryParams,
  CreateClothingItemBody,
  GetClothingItemParams,
  UpdateClothingItemParams,
  UpdateClothingItemBody,
  DeleteClothingItemParams,
  GenerateOutfitBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── Clothing image validation via Gemini ────────────────────────────────────────

router.post("/clothing/validate-image", express.json({ limit: "4mb" }), async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64?: string };

  if (!imageBase64 || typeof imageBase64 !== "string") {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const apiKey  = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

  if (!apiKey || !baseUrl) {
    // Fail open — if env vars not set, allow the upload
    res.json({ isClothing: true, reason: "Validation unavailable (no API key)" });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey, baseUrl });

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: imageBase64,
              },
            },
            {
              text: `Does this image show a clothing item or pair of shoes?
Clothing items include: shirts, tops, blouses, t-shirts, sweaters, hoodies, jackets, coats, pants, jeans, shorts, skirts, dresses, socks, shoes, sneakers, boots, sandals, hats, scarves, gloves, belts, bags, and similar wearables.

Reply with a JSON object (no markdown, no code fences) with exactly two keys:
  "isClothing": boolean  — true if the image clearly shows a clothing item or wearable accessory
  "reason": string       — one sentence explanation`,
            },
          ],
        },
      ],
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse the JSON response — strip any accidental markdown fences
    const cleaned = text.replace(/```[a-z]*\n?/gi, "").trim();
    let parsed: { isClothing: boolean; reason: string };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If Gemini didn't return valid JSON, fail open
      res.json({ isClothing: true, reason: "Could not parse model response" });
      return;
    }

    res.json({
      isClothing: Boolean(parsed.isClothing),
      reason: String(parsed.reason ?? ""),
    });
  } catch (err) {
    console.error("Gemini clothing validation error:", err);
    // Fail open on unexpected errors so a Gemini outage doesn't block uploads
    res.json({ isClothing: true, reason: "Validation service error" });
  }
});

router.get("/clothing", async (req, res): Promise<void> => {
  const parsed = ListClothingQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let items;
  if (parsed.data.category) {
    items = await db
      .select()
      .from(clothingItemsTable)
      .where(eq(clothingItemsTable.category, parsed.data.category))
      .orderBy(clothingItemsTable.createdAt);
  } else {
    items = await db
      .select()
      .from(clothingItemsTable)
      .orderBy(clothingItemsTable.createdAt);
  }

  res.json(items);
});

router.post("/clothing", async (req, res): Promise<void> => {
  const parsed = CreateClothingItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(clothingItemsTable)
    .values({
      name: parsed.data.name,
      category: parsed.data.category,
      imageObjectPath: parsed.data.imageObjectPath ?? null,
      color: parsed.data.color ?? null,
      brand: parsed.data.brand ?? null,
      size: parsed.data.size ?? null,
      season: parsed.data.season ?? null,
      occasion: parsed.data.occasion ?? null,
      purchasePrice: parsed.data.purchasePrice ?? null,
      purchaseDate: parsed.data.purchaseDate ?? null,
      notes: parsed.data.notes ?? null,
      isFavorite: parsed.data.isFavorite ?? false,
    })
    .returning();

  res.status(201).json(item);
});

router.get("/clothing/stats", async (req, res): Promise<void> => {
  const allItems = await db.select().from(clothingItemsTable);

  const byCategory = CLOTHING_CATEGORIES.map((cat) => ({
    category: cat,
    count: allItems.filter((i) => i.category === cat).length,
  }));

  const favorites = allItems.filter((i) => i.isFavorite).length;

  const [outfitCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedOutfitsTable);

  res.json({
    total: allItems.length,
    byCategory,
    favorites,
    outfitsGenerated: outfitCountResult?.count ?? 0,
  });
});

router.post("/clothing/generate-outfit", async (req, res): Promise<void> => {
  const parsed = GenerateOutfitBody.safeParse(req.body ?? {});

  const allItems = await db.select().from(clothingItemsTable);

  const excludeCategories = parsed.success ? (parsed.data.excludeCategories ?? []) : [];

  const activeCategories = CLOTHING_CATEGORIES.filter(
    (cat) => !excludeCategories.includes(cat)
  );

  // Group items by category
  const byCategory: Record<string, typeof allItems> = {};
  for (const cat of activeCategories) {
    const catItems = allItems.filter((i) => i.category === cat);
    if (catItems.length > 0) {
      byCategory[cat] = catItems;
    }
  }

  if (Object.keys(byCategory).length === 0) {
    res.status(422).json({ error: "Not enough clothing items to generate an outfit. Add some items first!" });
    return;
  }

  // Pick one random item per available category (top, bottom, shoes are preferred)
  const preferredOrder = ["tops", "bottoms", "shoes", "outerwear", "dresses", "accessories"];
  const outfitItems: typeof allItems = [];

  for (const cat of preferredOrder) {
    if (byCategory[cat]) {
      const catItems = byCategory[cat];
      const picked = catItems[Math.floor(Math.random() * catItems.length)];
      outfitItems.push(picked);

      // If we picked a dress, skip tops and bottoms
      if (cat === "dresses") break;
      // Skip outerwear if we have enough items already
      if (outfitItems.length >= 4 && cat === "outerwear") continue;
    }
  }

  res.json({ items: outfitItems });
});

router.get("/clothing/:id", async (req, res): Promise<void> => {
  const params = GetClothingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(clothingItemsTable)
    .where(eq(clothingItemsTable.id, params.data.id));

  if (!item) {
    res.status(404).json({ error: "Clothing item not found" });
    return;
  }

  res.json(item);
});

router.patch("/clothing/:id", async (req, res): Promise<void> => {
  const params = UpdateClothingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClothingItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  // Helper: treat empty string as null so the UI can clear optional text fields.
  const nullIfEmpty = (v: string | undefined) =>
    v === undefined ? undefined : v.trim() === "" ? null : v.trim();

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
  if (parsed.data.imageObjectPath !== undefined) updateData.imageObjectPath = parsed.data.imageObjectPath;
  if (parsed.data.color         !== undefined) updateData.color         = nullIfEmpty(parsed.data.color);
  if (parsed.data.brand         !== undefined) updateData.brand         = nullIfEmpty(parsed.data.brand);
  if (parsed.data.size          !== undefined) updateData.size          = nullIfEmpty(parsed.data.size);
  if (parsed.data.season        !== undefined) updateData.season        = nullIfEmpty(parsed.data.season);
  if (parsed.data.occasion      !== undefined) updateData.occasion      = nullIfEmpty(parsed.data.occasion);
  if (parsed.data.purchasePrice !== undefined) updateData.purchasePrice = nullIfEmpty(parsed.data.purchasePrice);
  if (parsed.data.purchaseDate  !== undefined) updateData.purchaseDate  = nullIfEmpty(parsed.data.purchaseDate);
  if (parsed.data.notes         !== undefined) updateData.notes         = nullIfEmpty(parsed.data.notes);
  if (parsed.data.isFavorite    !== undefined) updateData.isFavorite    = parsed.data.isFavorite;
  if (parsed.data.timesWorn     !== undefined) updateData.timesWorn     = parsed.data.timesWorn;

  const [item] = await db
    .update(clothingItemsTable)
    .set(updateData)
    .where(eq(clothingItemsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Clothing item not found" });
    return;
  }

  res.json(item);
});

router.delete("/clothing/:id", async (req, res): Promise<void> => {
  const params = DeleteClothingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Clean up outfit_items references
  await db
    .delete(outfitItemsTable)
    .where(eq(outfitItemsTable.clothingItemId, params.data.id));

  const [deleted] = await db
    .delete(clothingItemsTable)
    .where(eq(clothingItemsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Clothing item not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
