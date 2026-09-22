import { z } from "zod";
import { LANGUAGE_DIRECTIONS, WORKSPACE_ROLES } from "@/types/domain";
import { brandingListSchema } from "@/lib/branding";

export const uuid = z.string().uuid();
export const createProjectSchema = z.object({ workspaceId: uuid, title: z.string().trim().min(1).max(240), direction: z.enum(LANGUAGE_DIRECTIONS) });
export const createUploadSchema = z.object({ workspaceId: uuid, projectId: uuid, fileName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(200), size: z.number().int().positive().max(50 * 1024 * 1024) });
export const estimateSchema = z.object({ workspaceId: uuid, projectId: uuid, documentId: uuid.optional(), text: z.string().max(2_000_000).optional(), direction: z.enum(LANGUAGE_DIRECTIONS), branding: brandingListSchema.default([]) }).refine((value) => Boolean(value.documentId || value.text?.trim()), "A document or source text is required.");
export const startTranslationSchema = z.object({ workspaceId: uuid, projectId: uuid });
export const segmentEditSchema = z.object({ sourceText: z.string().max(200_000).optional(), translatedText: z.string().max(200_000).optional(), reason: z.string().max(500).optional() }).refine((value) => value.sourceText !== undefined || value.translatedText !== undefined, "No editable field supplied.");
export const reviewSchema = z.object({ workspaceId: uuid, projectId: uuid, action: z.enum(["submit", "request_changes", "approve"]), reason: z.string().max(2000).optional(), ownerOverride: z.boolean().default(false) });
export const exportSchema = z.object({ workspaceId: uuid, projectId: uuid, format: z.enum(["docx", "pdf", "txt"]) });
export const createWorkspaceSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const inviteSchema = z.object({ email: z.string().email(), role: z.enum(WORKSPACE_ROLES).refine((role) => role !== "owner") });
export const glossarySchema = z.object({ sourceTerm: z.string().trim().min(1).max(500), targetTerm: z.string().trim().min(1).max(500), direction: z.enum(LANGUAGE_DIRECTIONS), notes: z.string().max(2000).optional(), caseSensitive: z.boolean().default(false) });
export const consentSchema = z.object({ workspaceId: uuid, globalLearning: z.boolean() });
export const adminGrantSchema = z.object({ workspaceId: uuid, amount: z.number().int().positive().max(1_000_000), reason: z.string().trim().min(8).max(1000) });

// --- Commercial layer: sales, subscriptions, payments ---
export const recordSaleSchema = z.object({ workspaceId: uuid, customerName: z.string().trim().min(1).max(200), description: z.string().max(1000).optional(), amount: z.number().positive().max(10_000_000), currency: z.string().trim().length(3).default("QAR"), saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), documentProjectId: uuid.optional() });
export const updateSaleSchema = z.object({ customerName: z.string().trim().min(1).max(200).optional(), description: z.string().max(1000).optional(), amount: z.number().positive().max(10_000_000).optional(), saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(["recorded", "void"]).optional() });
export const recordSalePaymentSchema = z.object({ amount: z.number().positive().max(10_000_000), method: z.enum(["cash", "card", "bank_transfer", "cheque", "other"]).default("cash"), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), reference: z.string().max(200).optional() });
export const changePlanSchema = z.object({ workspaceId: uuid, planCode: z.string().regex(/^[a-z0-9_-]+$/) });
export const cancelSubscriptionSchema = z.object({ workspaceId: uuid, immediate: z.boolean().default(false) });
export const adminSetPlanSchema = z.object({ workspaceId: uuid, planCode: z.string().regex(/^[a-z0-9_-]+$/), periodDays: z.number().int().min(1).max(400).default(30) });
export const adminSuspendSchema = z.object({ workspaceId: uuid, suspended: z.boolean() });
