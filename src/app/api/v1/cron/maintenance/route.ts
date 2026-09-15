import { ApiError, requireUser } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/server";

// Hourly maintenance: releases expired or stalled credit reservations.
// Invoked by the Vercel cron defined in vercel.json (which sends the
// x-vercel-cron header) and optionally by an operator with CRON_SECRET.
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const cronHeader = request.headers.get("x-vercel-cron");
    const bearer = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!cronHeader && !(secret && bearer === `Bearer ${secret}`)) {
      // Fall back to a signed-in platform administrator for manual runs.
      await requireUser();
    }
    const { data, error } = await createAdminClient().rpc("release_expired_reservations");
    if (error) throw error;
    return apiData({ released: Number(data ?? 0) });
  } catch (error) {
    if (error instanceof ApiError) return apiError(error);
    return apiError(error);
  }
}
