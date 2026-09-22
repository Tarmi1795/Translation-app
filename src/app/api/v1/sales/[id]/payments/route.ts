import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";
import { recordSalePaymentSchema } from "@/lib/api/schemas";
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = recordSalePaymentSchema.parse(await request.json());
    const supabase = await createClient();

    // Verify the sale exists and belongs to a workspace the caller administers.
    const { data: sale, error: saleError } = await supabase.from("sales").select("id,workspace_id,customer_name,description,amount,currency,sale_date,status,document_project_id,created_at").eq("id", id).maybeSingle();
    if (saleError) throw saleError;
    if (!sale) throw new ApiError(404, "Sale not found.", "not_found");
    const { user } = await requireWorkspaceRole(sale.workspace_id, ["owner", "admin"]);

    const { error } = await supabase.from("sale_payments").insert({
      sale_id: id,
      workspace_id: sale.workspace_id,
      amount: input.amount,
      method: input.method,
      paid_on: input.paidOn,
      reference: input.reference,
      recorded_by: user.id,
    });
    if (error) throw error;

    // The DB trigger recomputes the sale's status from its payments.
    const { data: updated, error: reloadError } = await supabase
      .from("sales")
      .select("id,customer_name,description,amount,currency,sale_date,status,document_project_id,created_at")
      .eq("id", id)
      .single();
    if (reloadError) throw reloadError;
    const { data: paymentRows, error: paymentsError } = await supabase.from("sale_payments").select("amount").eq("sale_id", id);
    if (paymentsError) throw paymentsError;
    const amountPaid = (paymentRows ?? []).reduce((sum, payment: { amount: string | number }) => sum + Number(payment.amount), 0);

    return apiData({ sale: toSaleRecord(updated as SaleRow, amountPaid) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
