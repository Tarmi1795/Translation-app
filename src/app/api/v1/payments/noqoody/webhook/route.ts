import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/api/schemas";

const webhookEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  eventType: z.string().min(1).max(100),
  workspaceId: uuid,
  planCode: z.string().min(1).max(100),
  amount: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  periodDays: z.number().int().min(1).max(400).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    // The signature covers the exact raw bytes; parse only after verification.
    const raw = await request.text();

    const secret = process.env.NOQOODY_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(503, "Payment provider is not configured.", "provider_disabled");

    const signature = request.headers.get("x-noqoody-signature");
    if (!signature) throw new ApiError(401, "Invalid signature.", "invalid_signature");
    const expected = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"), "utf8");
    const received = Buffer.from(signature, "utf8");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new ApiError(401, "Invalid signature.", "invalid_signature");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "The webhook body is not valid JSON.", "invalid_payload");
    }
    const event = webhookEventSchema.parse(parsed);

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("apply_provider_payment", {
      p_provider: "noqoody",
      p_provider_event_id: event.eventId,
      p_event_type: event.eventType,
      p_workspace_id: event.workspaceId,
      p_plan_code: event.planCode,
      p_amount: event.amount ?? null,
      p_currency: event.currency ?? null,
      p_period_days: event.periodDays ?? null,
      p_payload: event.payload ?? {},
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const result: string = row?.result ?? "ignored";

    // Duplicates, unknown plans, and ignored event types all answer 200 so the
    // provider stops retrying; only auth/config problems answer non-2xx.
    if (result === "already_processed") return apiData({ result, eventId: event.eventId });
    return apiData({ result });
  } catch (error) { return apiError(error); }
}
