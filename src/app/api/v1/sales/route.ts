import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { apiData, apiError, parsePagination } from "@/lib/http";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { recordSaleSchema } from "@/lib/api/schemas";
import type { SaleRecord, SalesTotals } from "@/types/domain";

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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS_OF_TREND = 6;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Sums each sale's payments (fetched for a page of sale ids) in JS to avoid N+1 queries.
function sumPaymentsBySale(rows: { sale_id: string; amount: string | number }[] | null | undefined) {
  const paidBySale = new Map<string, number>();
  for (const payment of rows ?? []) {
    paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + Number(payment.amount));
  }
  return paidBySale;
}

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new ApiError(400, "A workspace_id query parameter is required.", "validation_error");
    await requireWorkspaceRole(workspaceId);

    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    if (fromParam !== null && !DATE_PATTERN.test(fromParam)) throw new ApiError(400, "from must be a YYYY-MM-DD date.", "validation_error");
    if (toParam !== null && !DATE_PATTERN.test(toParam)) throw new ApiError(400, "to must be a YYYY-MM-DD date.", "validation_error");
    const now = new Date();
    const from = fromParam ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const to = toParam ?? localDate(now);

    const { from: pageFrom, to: pageTo, page, pageSize } = parsePagination(url);
    const supabase = await createClient();

    const { data: saleRows, error: salesError, count } = await supabase
      .from("sales")
      .select("id,customer_name,description,amount,currency,sale_date,status,document_project_id,created_at", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(pageFrom, pageTo);
    if (salesError) throw salesError;
    const sales = (saleRows as SaleRow[] | null) ?? [];

    const saleIds = sales.map((sale) => sale.id);
    let paidBySale = new Map<string, number>();
    if (saleIds.length) {
      const { data: paymentRows, error: paymentsError } = await supabase.from("sale_payments").select("sale_id,amount").in("sale_id", saleIds);
      if (paymentsError) throw paymentsError;
      paidBySale = sumPaymentsBySale(paymentRows);
    }

    // Totals over non-void sales in range; received counts payments landed in range
    // against non-void sales so outstanding never goes negative after a void.
    const [{ data: totalRows, error: totalsError }, { data: receivedRows, error: receivedError }] = await Promise.all([
      supabase.from("sales").select("amount,currency").eq("workspace_id", workspaceId).neq("status", "void").gte("sale_date", from).lte("sale_date", to),
      supabase.from("sale_payments").select("amount,sales!inner(status)").eq("workspace_id", workspaceId).gte("paid_on", from).lte("paid_on", to).neq("sales.status", "void"),
    ]);
    if (totalsError) throw totalsError;
    if (receivedError) throw receivedError;
    const recorded = (totalRows ?? []).reduce((sum, row: { amount: string | number }) => sum + Number(row.amount), 0);
    const received = (receivedRows ?? []).reduce((sum, row: { amount: string | number }) => sum + Number(row.amount), 0);
    const totals: SalesTotals = {
      recorded,
      received,
      outstanding: recorded - received,
      currency: totalRows?.[0]?.currency ?? "QAR",
      count: totalRows?.length ?? 0,
    };

    const [documentsCountRes, jobsCompletedRes] = await Promise.all([
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("translation_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("stage", "completed"),
    ]);
    if (documentsCountRes.error) throw documentsCountRes.error;
    if (jobsCompletedRes.error) throw jobsCompletedRes.error;
    const processing = {
      documents: documentsCountRes.count ?? 0,
      jobsCompleted: jobsCompletedRes.count ?? 0,
    };

    // Last 6 calendar months (including the current one), ascending.
    const months: string[] = [];
    for (let index = MONTHS_OF_TREND - 1; index >= 0; index--) {
      const month = new Date(now.getFullYear(), now.getMonth() - index, 1);
      months.push(`${month.getFullYear()}-${pad(month.getMonth() + 1)}`);
    }
    const trendFrom = `${months[0]}-01`;
    const trendToDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const trendTo = localDate(trendToDate);
    const [{ data: trendSaleRows, error: trendSalesError }, { data: trendPaymentRows, error: trendPaymentsError }] = await Promise.all([
      supabase.from("sales").select("sale_date,amount").eq("workspace_id", workspaceId).neq("status", "void").gte("sale_date", trendFrom).lte("sale_date", trendTo),
      supabase.from("sale_payments").select("paid_on,amount,sales!inner(status)").eq("workspace_id", workspaceId).gte("paid_on", trendFrom).lte("paid_on", trendTo).neq("sales.status", "void"),
    ]);
    if (trendSalesError) throw trendSalesError;
    if (trendPaymentsError) throw trendPaymentsError;
    const recordedByMonth = new Map<string, number>(months.map((period) => [period, 0]));
    const receivedByMonth = new Map<string, number>(months.map((period) => [period, 0]));
    for (const row of trendSaleRows ?? []) recordedByMonth.set(String(row.sale_date).slice(0, 7), (recordedByMonth.get(String(row.sale_date).slice(0, 7)) ?? 0) + Number(row.amount));
    for (const row of trendPaymentRows ?? []) receivedByMonth.set(String(row.paid_on).slice(0, 7), (receivedByMonth.get(String(row.paid_on).slice(0, 7)) ?? 0) + Number(row.amount));
    const trend = months.map((period) => ({ period, recorded: recordedByMonth.get(period) ?? 0, received: receivedByMonth.get(period) ?? 0 }));

    return apiData({
      sales: sales.map((sale) => toSaleRecord(sale, paidBySale.get(sale.id) ?? 0)),
      total: count ?? 0,
      page,
      pageSize,
      totals,
      processing,
      trend,
    });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const input = recordSaleSchema.parse(await request.json());
    const { user } = await requireWorkspaceRole(input.workspaceId, ["owner", "admin"]);
    const supabase = await createClient();

    const { data: sale, error } = await supabase
      .from("sales")
      .insert({
        workspace_id: input.workspaceId,
        recorded_by: user.id,
        customer_name: input.customerName,
        description: input.description,
        amount: input.amount,
        currency: input.currency,
        sale_date: input.saleDate,
        document_project_id: input.documentProjectId,
      })
      .select("id,customer_name,description,amount,currency,sale_date,status,document_project_id,created_at")
      .single();
    if (error) throw error;

    const admin = createAdminClient();
    const { error: auditError } = await admin.from("audit_logs").insert({
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: "sales.recorded",
      target_type: "sale",
      target_id: sale.id,
      metadata: { amount: Number(sale.amount), currency: sale.currency, customerName: sale.customer_name },
    });
    if (auditError) throw auditError;

    return apiData({ sale: toSaleRecord(sale as SaleRow, 0) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
