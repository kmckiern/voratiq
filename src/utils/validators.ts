export function ensureNonEmptyString(
  value: unknown,
  errorMessage: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(errorMessage);
  }
  return value;
}

export function ensureStringArray(
  value: unknown,
  errorMessage: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(errorMessage);
  }
  return value as string[];
}
