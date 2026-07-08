export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  error: null;
};

export type ApiErrorResponse = {
  success: false;
  data: null;
  error: string;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function isApiSuccess<T>(
  response: ApiResponse<T>,
): response is ApiSuccessResponse<T> {
  return response.success;
}

export function isApiError(
  response: ApiResponse<unknown>,
): response is ApiErrorResponse {
  return !response.success;
}
