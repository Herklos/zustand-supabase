/**
 * Encode a composite primary key into a single string for Map storage.
 * For single keys, returns the value as-is. For composite, joins with "::".
 */
export function encodeKey(
  row: Record<string, unknown>,
  primaryKey: string | string[],
): string | number {
  if (typeof primaryKey === "string") {
    return row[primaryKey] as string | number
  }
  return primaryKey.map((k) => String(row[k])).join("::")
}

/**
 * Build a filter object for a primary key (used in Supabase .eq() chains).
 */
export function buildPkFilter(
  primaryKey: string | string[],
  id: string | number,
): Record<string, unknown> {
  if (typeof primaryKey === "string") {
    return { [primaryKey]: id }
  }
  // Decode composite key
  const parts = String(id).split("::")
  const filter: Record<string, unknown> = {}
  for (let i = 0; i < primaryKey.length; i++) {
    filter[primaryKey[i]!] = parts[i]
  }
  return filter
}

/**
 * Apply primary key equality filters to a Supabase builder.
 */
export function applyPkFilters(
  builder: any,
  primaryKey: string | string[],
  id: string | number,
): any {
  if (typeof primaryKey === "string") {
    return builder.eq(primaryKey, id)
  }
  const parts = String(id).split("::")
  let q = builder
  for (let i = 0; i < primaryKey.length; i++) {
    q = q.eq(primaryKey[i], parts[i])
  }
  return q
}

/**
 * Get the primary key column name(s) as a normalized string[].
 */
export function normalizePk(primaryKey: string | string[]): string[] {
  return typeof primaryKey === "string" ? [primaryKey] : primaryKey
}
