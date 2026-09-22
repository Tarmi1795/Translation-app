import { ApiError, requireWorkspaceRole } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Quotes a CSV cell; newlines are collapsed so row structure stays intact.
function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value).replace(/[\r\n]+/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function csvAmount(value: number) {
  return value.toFixed(2);
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

    const supabase = await createClient();
    const { data: sales, error } = await supabase
      .from("sales")
      .select("id,customer_name,description,amount,currency,sale_date,status")
      .eq("workspace_id", workspaceId)
      .neq("status", "void")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: false });
    if (error) throw error;

    const saleIds = (sales ?? []).map((sale: { id: string }) => sale.id);
    const paidBySale = new Map<string, number>();
    if (saleIds.length) {
      const { data: paymentRows, error: paymentsError } = await supabase.from("sale_payments").select("sale_id,amount").in("sale_id", saleIds);
      if (paymentsError) throw paymentsError;
      for (const payment of paymentRows ?? []) {
        paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + Number(payment.amount));
      }
    }

    const lines: string[] = ["Date,Customer,Description,Amount,Currency,Status,Received,Outstanding"];
    let recordedTotal = 0;
    let receivedTotal = 0;
    for (const sale of sales ?? []) {
      const amount = Number(sale.amount);
      const received = paidBySale.get(sale.id) ?? 0;
      recordedTotal += amount;
      receivedTotal += received;
      lines.push([
        csvCell(sale.sale_date),
        csvCell(sale.customer_name),
        csvCell(sale.description),
        csvCell(csvAmount(amount)),
        csvCell(sale.currency),
        csvCell(sale.status),
        csvCell(csvAmount(received)),
        csvCell(csvAmount(Math.max(0, amount - received))),
      ].join(","));
    }
    const currency = (sales ?? [])[0]?.currency ?? "QAR";
    lines.push([
      csvCell("TOTAL"),
      csvCell(""),
      csvCell(""),
      csvCell(csvAmount(recordedTotal)),
      csvCell(currency),
      csvCell(""),
      csvCell(csvAmount(receivedTotal)),
      csvCell(csvAmount(Math.max(0, recordedTotal - receivedTotal))),
    ].join(","));

    // UTF-8 BOM keeps Arabic customer names readable when opened in Excel.
    const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sales-report_${from}_to_${to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) { return apiError(error); }
}
