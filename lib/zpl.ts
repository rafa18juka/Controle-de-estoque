import { truncate } from "./utils";

interface GenerateZplParams {
  sku: string;
  name: string;
  unitPrice: number;
  widthMm?: number;
  heightMm?: number;
  columns?: number;
  columnGapMm?: number;
}

const DEFAULT_WIDTH_MM = 40;
const DEFAULT_HEIGHT_MM = 25;
const DEFAULT_COLUMN_GAP_MM = 3;
const DOTS_PER_MM = 8; // 203 dpi ~ 8 dpmm

export function generateZPL({
  sku,
  name,
  unitPrice,
  widthMm = DEFAULT_WIDTH_MM,
  heightMm = DEFAULT_HEIGHT_MM,
  columns = 1,
  columnGapMm = DEFAULT_COLUMN_GAP_MM
}: GenerateZplParams) {
  const columnWidth = Math.round(widthMm * DOTS_PER_MM);
  const gapDots = columns > 1 ? Math.max(0, Math.round(columnGapMm * DOTS_PER_MM)) : 0;
  const totalWidth = columnWidth * columns + gapDots * (columns - 1);
  const height = Math.round(heightMm * DOTS_PER_MM);
  const safeName = truncate(name, 24).toUpperCase();
  const price = unitPrice.toFixed(2);

  const segments = [`^XA`, `^PW${totalWidth}`, `^LL${height}`];

  for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
    const offset = columnIndex * (columnWidth + gapDots);
    segments.push(
      `^CF0,32`,
      `^FO${offset + 20},20^FD${safeName}^FS`,
      `^CF0,24`,
      `^FO${offset + 20},60^FD$${price}^FS`,
      `^FO${offset + 20},90^BCN,80,Y,N,N`,
      `^FD${sku}^FS`,
      `^CF0,20`,
      `^FO${offset + 20},180^FD${sku}^FS`
    );
  }

  segments.push(`^XZ`);

  return segments.join("\n");
}

export function getZplDimensions(
  widthMm = DEFAULT_WIDTH_MM,
  heightMm = DEFAULT_HEIGHT_MM,
  columns = 1,
  columnGapMm = DEFAULT_COLUMN_GAP_MM
) {
  const columnWidth = Math.round(widthMm * DOTS_PER_MM);
  const gapDots = columns > 1 ? Math.max(0, Math.round(columnGapMm * DOTS_PER_MM)) : 0;
  return {
    width: columnWidth * columns + gapDots * (columns - 1),
    height: Math.round(heightMm * DOTS_PER_MM)
  };
}
