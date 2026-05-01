import { NextResponse } from "next/server";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function parsePagination(searchParams: URLSearchParams): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json({
    data,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  });
}

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
