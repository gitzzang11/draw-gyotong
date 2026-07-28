export const CURRENT_SAVE_SCHEMA_VERSION = 3;

export function stableEntityId(prefix: string, seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function ensureStableId(value: unknown, prefix: string, seed: string) {
  return typeof value === "string" && value.trim() ? value : stableEntityId(prefix, seed);
}
