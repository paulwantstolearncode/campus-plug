/**
 * Safely formats a user's display name.
 *
 * Google Sign-In stores the email in profiles.full_name, so raw names can
 * look like "ikethallium06@gmail.com" or "Patricialovia93" — the kind of
 * string that reads as a scam account. This returns a cleaned, human-looking
 * display name:
 *
 * - "ikethallium06@gmail.com" → "Ikethallium"
 * - "Patricialovia93"        → "Patricialovia"
 * - "Mark Juni Ander"        → "Mark"
 * - "" / null / undefined    → "Seller"
 */
export function formatName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== "string") return "Seller";

  const trimmed = rawName.trim();
  if (!trimmed) return "Seller";

  if (trimmed.includes("@")) {
    const localPart = trimmed.split("@")[0];
    const cleaned = localPart.replace(/[._0-9]+/g, " ").trim();
    return capitalize(cleaned.split(" ")[0] || "Seller");
  }

  if (/^[a-zA-Z]+[0-9]+$/.test(trimmed)) {
    const cleaned = trimmed.replace(/[0-9]+/g, "").trim();
    return capitalize(cleaned) || "Seller";
  }

  const firstName = trimmed.split(" ")[0];
  return capitalize(firstName);
}

function capitalize(str: string): string {
  if (!str) return "Seller";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
