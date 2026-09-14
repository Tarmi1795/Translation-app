import { z } from "zod";
import type { BrandingPlacement } from "@/types/domain";

// Values are fractions of page width/height, independent of screen zoom or DPI.
export const placementSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().min(0.02).max(1),
  pages: z.enum(["first", "all", "last"]),
}).refine((value) => value.x + value.width <= 1.001, "Branding extends beyond the page width.");

export const brandingSelectionSchema = z.object({
  assetId: z.string().uuid(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().min(0.02).max(1),
  pages: z.enum(["first", "all", "last"]),
  skipIfPresent: z.boolean().default(true),
  alreadyPresent: z.boolean().default(false),
}).refine((value) => value.x + value.width <= 1.001, "Branding extends beyond the page width.");
export const brandingListSchema = z.array(brandingSelectionSchema).max(2).refine(
  (items) => new Set(items.map((item) => item.assetId)).size === items.length,
  "Choose each branding asset only once.",
);

export function defaultPlacement(kind: "letterhead" | "stamp"): BrandingPlacement {
  return kind === "letterhead"
    ? { x: 0.08, y: 0.03, width: 0.84, pages: "all" }
    : { x: 0.72, y: 0.8, width: 0.18, pages: "last" };
}

export function appliesToPage(placement: BrandingPlacement, page: number, count: number) {
  return placement.pages === "all" || (placement.pages === "first" ? page === 1 : page === count);
}
