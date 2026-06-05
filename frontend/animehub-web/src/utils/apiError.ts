type ApiError = {
  code?: string;
  message?: string;
  errors?: Record<string, string[]>;
};

export function getErrorMessage(error: unknown, fallback = "Request failed") {
  return error instanceof Error ? error.message : fallback;
}

export async function readApiError(
  response: Response,
  fallback = "Request failed",
) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => null)) as ApiError | null;
    const validationMessage = data?.errors
      ? Object.values(data.errors).flat().filter(Boolean).join(" ")
      : "";

    return (
      data?.message ||
      validationMessage ||
      `${response.status} ${response.statusText}` ||
      fallback
    );
  }

  const text = await response.text().catch(() => "");
  return text || `${response.status} ${response.statusText}` || fallback;
}
