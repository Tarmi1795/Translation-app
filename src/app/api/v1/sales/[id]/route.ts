import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { updateSaleSchema } from "@/lib/api/schemas";
import type { SaleRecord } from "@/types/domain";

type SaleRow = {
  id: string;
  customer_name: string;
  description: string | null;
  amount: string | number;
  currency: string;
  sale_date: string;
  status: SaleRecord["status"];
  document_project_id: string | null;
  created_at: string;
};

const SALE_COLUMNS = "id,customer_name,description,amount,currency,sale_date,status,document_project_id,created_at";

function toSaleRecord(row: SaleRow, amountPaid: number): SaleRecord {
  const amount = Number(row.amount);
  return {
    id: row.id,
    customerName: row.customer_name,
    description: row.description,
    amount,
    currency: row.currency,
    saleDate: row.sale_date,
    status: row.status,
    amountPaid,
    outstanding: row.status === "void" ? 0 : Math.max(0, amount - amountPaid),
    documentProjectId: row.document_project_id,
    createdAt: row.created_at,
  };
}

// Loads the sale and verifies the caller owns/admins its workspace.
async function loadSaleForAdmin(supabase: Awaited<ReturnType<typeof createClient>>, saleId: string) {
  const { data, error } = await supabase.from("sales").select(`workspace_id,${SALE_COLUMNS}`).eq("id", saleId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Sale not found.", "not_found");
  const workspaceId: string = data.workspace_id;
  const { user } = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  return { workspaceId, user, row: data as SaleRow & { workspace_id: string } };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = updateSaleSchema.parse(await request.json());
    const supabase = await createClient();
    const { workspaceId, user, row } = await loadSaleForAdmin(supabase, id);

    const patch: Record<string, unknown> = {};
    if (input.customerName !== undefined) patch.customer_name = input.customerName;
    if (input.description !== undefined) patch.description = input.description;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.saleDate !== undefined) patch.sale_date = input.saleDate;
    if (input.status !== undefined) patch.status = input.status;
    if (Object.keys(patch).length === 0) {
      const { data: paymentRows } = await supabase.from("sale_payments").select("amount").eq("sale_id", id);
      const amountPaid = (paymentRows ?? []).reduce((sum, payment: { amount: string | number }) => sum + Number(payment.amount), 0);
      return apiData({ sale: toSaleRecord(row, amountPaid) });
    }

    // Voiding changes nothing else: payments stay untouched and totals exclude void sales.
    const { data: updated, error } = await supabase.from("sales").update(patch).eq("id", id).select(SALE_COLUMNS).single();
    if (error) throw error;

    const { data: paymentRows, error: paymentsError } = await supabase.from("sale_payments").select("amount").eq("sale_id", id);
    if (paymentsError) throw paymentsError;
    const amountPaid = (paymentRows ?? []).reduce((sum, payment: { amount: string | number }) => sum + Number(payment.amount), 0);

    if (input.status !== undefined && input.status !== row.status) {
      const admin = createAdminClient();
      const { error: auditError } = await admin.from("audit_logs").insert({
        workspace_id: workspaceId,
        actor_id: user.id,
        action: "sales.updated",
        target_type: "sale",
        target_id: id,
        metadata: { status: input.status },
      });
      if (auditError) throw auditError;
    }

    return apiData({ sale: toSaleRecord(updated as SaleRow, amountPaid) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { workspaceId, user } = await loadSaleForAdmin(supabase, id);

    // Soft delete: totals and reports exclude void sales; the audit trail remains.
    const { error } = await supabase.from("sales").update({ status: "void" }).eq("id", id);
    if (error) throw error;

    const admin = createAdminClient();
    const { error: auditError } = await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: "sales.voided",
      target_type: "sale",
      target_id: id,
      metadata: {},
    });
    if (auditError) throw auditError;

    return apiData({ voided: true });
  } catch (error) { return apiError(error); }
}
