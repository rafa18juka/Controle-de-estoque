const MAGAZINE_LUIZA_PATTERN = /^\d{9}-\d{2}$/;

/**
 * Normaliza e identifica codigos de rastreio suportados.
 * - Mercado Livre: qualquer payload que comece com `{` (ex.: `{id":"..."` ou variantes).
 * - Shopee: qualquer valor que comece com `BR` (case insensitive).
 * - Shein: qualquer valor que comece com `GC` (case insensitive).
 * - Magazine Luiza: `#########-##`.
 */
export function parseTrackingCode(rawValue: string | null | undefined): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  if (MAGAZINE_LUIZA_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const upper = trimmed.toUpperCase();
  if (upper.startsWith("BR") || upper.startsWith("GC")) {
    return upper;
  }

  return null;
}
