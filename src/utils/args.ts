export interface RequiredFlagValueResult {
  value: string;
  nextIndex: number;
}

export function requireFlagValue(
  args: readonly string[],
  index: number,
  flag: string,
): RequiredFlagValueResult {
  const value = ensureNonEmptyString(
    args[index + 1],
    `Expected value after ${flag}`,
  );

  return { value, nextIndex: index + 2 };
}

export function ensureNonEmptyString(
  value: string | undefined,
  errorMessage: string,
): string {
  if (!value || value.trim().length === 0) {
    throw new Error(errorMessage);
  }

  return value;
}
