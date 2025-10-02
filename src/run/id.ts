import { randomBytes } from "node:crypto";

function formatDateSegment(value: number): string {
  return value.toString().padStart(2, "0");
}

function generateSlug(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(length);
  let slug = "";
  for (let index = 0; index < length; index += 1) {
    const value = bytes[index] ?? 0;
    slug += alphabet[value % alphabet.length];
  }
  return slug;
}

export function generateRunId(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = formatDateSegment(now.getUTCMonth() + 1);
  const day = formatDateSegment(now.getUTCDate());
  const hours = formatDateSegment(now.getUTCHours());
  const minutes = formatDateSegment(now.getUTCMinutes());
  const seconds = formatDateSegment(now.getUTCSeconds());
  const slug = generateSlug(5);

  return `${year}${month}${day}-${hours}${minutes}${seconds}-${slug}`;
}
