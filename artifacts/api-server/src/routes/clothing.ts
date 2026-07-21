import express, { Router, type IRouter } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
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
import { requireAuth, type AuthRequest } from "../middleware/requireAuth.js";

const router: IRouter = Router();

router.get("/clothing", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const parsed = ListClothingQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const items = parsed.data.category
    ? await db
        .select()
        .from(clothingItemsTable)
        .where(and(eq(clothingItemsTable.userId, userId), eq(clothingItemsTable.category, parsed.data.category)))
        .orderBy(desc(clothingItemsTable.createdAt))
    : await db
        .select()
        .from(clothingItemsTable)
        .where(eq(clothingItemsTable.userId, userId))
        .orderBy(desc(clothingItemsTable.createdAt));

  res.json(items);
});

router.post("/clothing", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const parsed = CreateClothingItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(clothingItemsTable)
    .values({
      userId,
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

router.get("/clothing/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const allItems = await db
    .select()
    .from(clothingItemsTable)
    .where(eq(clothingItemsTable.userId, userId));

  const byCategory = CLOTHING_CATEGORIES.map((cat) => ({
    category: cat,
    count: allItems.filter((i) => i.category === cat).length,
  }));

  const favorites = allItems.filter((i) => i.isFavorite).length;

  const [outfitCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedOutfitsTable)
    .where(eq(savedOutfitsTable.userId, userId));

  res.json({
    total: allItems.length,
    byCategory,
    favorites,
    outfitsGenerated: outfitCountResult?.count ?? 0,
  });
});

router.post("/clothing/generate-outfit", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const parsed = GenerateOutfitBody.safeParse(req.body ?? {});

  const allItems = await db
    .select()
    .from(clothingItemsTable)
    .where(eq(clothingItemsTable.userId, userId));

  const excludeCategories = parsed.success ? (parsed.data.excludeCategories ?? []) : [];
  const activeCategories = CLOTHING_CATEGORIES.filter((cat) => !excludeCategories.includes(cat));

  const byCategory: Record<string, typeof allItems> = {};
  for (const cat of activeCategories) {
    const catItems = allItems.filter((i) => i.category === cat);
    if (catItems.length > 0) byCategory[cat] = catItems;
  }

  if (Object.keys(byCategory).length === 0) {
    res.status(422).json({ error: "Your garage is empty. Add some items first!" });
    return;
  }

  const preferredOrder = ["outfits", "beauty", "toiletries", "essentials"];
  const outfitItems: typeof allItems = [];

  for (const cat of preferredOrder) {
    if (byCategory[cat]) {
      const catItems = byCategory[cat];
      const picked = catItems[Math.floor(Math.random() * catItems.length)];
      outfitItems.push(picked);
    }
  }

  res.json({ items: outfitItems });
});

router.get("/clothing/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const params = GetClothingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(clothingItemsTable)
    .where(and(eq(clothingItemsTable.id, params.data.id), eq(clothingItemsTable.userId, userId)));

  if (!item) {
    res.status(404).json({ error: "Clothing item not found" });
    return;
  }

  res.json(item);
});

router.patch("/clothing/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
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
    .where(and(eq(clothingItemsTable.id, params.data.id), eq(clothingItemsTable.userId, userId)))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Clothing item not found" });
    return;
  }

  res.json(item);
});

router.delete("/clothing/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const params = DeleteClothingItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify ownership BEFORE removing any related rows
  const [item] = await db
    .select()
    .from(clothingItemsTable)
    .where(and(eq(clothingItemsTable.id, params.data.id), eq(clothingItemsTable.userId, userId)));

  if (!item) {
    res.status(404).json({ error: "Clothing item not found" });
    return;
  }

  await db
    .delete(outfitItemsTable)
    .where(eq(outfitItemsTable.clothingItemId, params.data.id));

  await db
    .delete(clothingItemsTable)
    .where(eq(clothingItemsTable.id, params.data.id));

  res.sendStatus(204);
});

export default router;
