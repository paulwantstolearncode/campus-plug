/**
 * Extract a first-name-like token from a full_name field.
 * For Google sign-ins, full_name literally stores the email,
 * so we display only a first name for privacy.
 *
 * Examples:
 * - "kwame.mensah@gmail.com" → "Kwame"
 * - "Mark Juni Ander" → "Mark"
 * - "markjunianders@gmail.com" → "Markjunianders"
 * - null → "Guest"
 */
export function formatName(fullName: string | null | undefined): string {
  if (!fullName) return 'Guest'
  const base = fullName.trim().split('@')[0]
  const tokens = base.split(/[\s._-]+/).filter(Boolean)
  if (tokens.length === 0) return 'Guest'
  const first = tokens[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}
