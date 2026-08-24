import { cookies } from "next/headers";
import { z } from "zod";
import { requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";

const inputSchema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const { workspaceId } = inputSchema.parse(await request.json());
    await requireWorkspaceRole(workspaceId);
    const store = await cookies();
    store.set("eatai_workspace", workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31_536_000 });
    return apiData({ workspaceId });
  } catch (error) {
    return apiError(error);
  }
}
