import { NextResponse } from "next/server";
import type { ApiErrorResponse, ApiSuccessResponse } from "./api-response";

export function apiSuccess<T>(data: T, status = 200) {
  const body: ApiSuccessResponse<T> = { success: true, data, error: null };
  return NextResponse.json(body, { status });
}

export function apiError(error: string, status = 500) {
  const body: ApiErrorResponse = { success: false, data: null, error };
  return NextResponse.json(body, { status });
}
