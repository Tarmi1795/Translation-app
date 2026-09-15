import { NextResponse } from "next/server";
import { ApiError } from "@/lib/auth";
import { ZodError } from "zod";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

export function apiData<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    { data },
    { ...init, headers: { ...NO_STORE_HEADERS, ...init?.headers } },
  );
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "invalid_input", message: error.issues.map((issue) => issue.message).join(" ") } }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: { code: "internal_error", message: "The request could not be completed." } },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

export function parsePagination(url: URL) {
  const rawPage = Number(url.searchParams.get("page") ?? 1);
  const rawPageSize = Number(url.searchParams.get("page_size") ?? 20);
  const page = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 20));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}
