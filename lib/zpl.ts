import { truncate } from "./utils";

export interface LabelItem {
  sku: string;
  name: string;
}

interface GenerateZplParams {
  items: LabelItem[];
  widthMm?: number;
  heightMm?: number;
  columns?: number;
  columnGapMm?: number;
}

const DEFAULT_WIDTH_MM = 40;
const DEFAULT_HEIGHT_MM = 20;
const DEFAULT_COLUMN_GAP_MM = 3;
const DOTS_PER_MM = 8; // 203 dpi ~ 8 dpmm

export function generateZPL({
  items,
  widthMm = DEFAULT_WIDTH_MM,
  heightMm = DEFAULT_HEIGHT_MM,
  columns = 1,
  columnGapMm = DEFAULT_COLUMN_GAP_MM
}: GenerateZplParams) {
  const columnCount = Math.max(1, columns);
  const columnWidth = Math.round(widthMm * DOTS_PER_MM);
  const gapDots = columnCount > 1 ? Math.max(0, Math.round(columnGapMm * DOTS_PER_MM)) : 0;
  const totalWidth = columnWidth * columnCount + gapDots * (columnCount - 1);
  const height = Math.round(heightMm * DOTS_PER_MM);

  const horizontalPadding = Math.round(2 * DOTS_PER_MM);
  const topPadding = Math.round(2 * DOTS_PER_MM);
  const bottomPadding = Math.round(3 * DOTS_PER_MM);
  const textBoxWidth = Math.max(1, columnWidth - horizontalPadding * 2);
  const barcodeHeightDots = Math.round(8 * DOTS_PER_MM);
  const barcodeTop = Math.max(
    topPadding + Math.round(4 * DOTS_PER_MM),
    height - bottomPadding - barcodeHeightDots
  );
  const lineSpacing = Math.round(1.5 * DOTS_PER_MM);

  const segments = [`^XA`, `^PW${totalWidth}`, `^LL${height}`];

  items.slice(0, columnCount).forEach((item, index) => {
    if (!item) return;

    const offset = index * (columnWidth + gapDots);
    const safeName = truncate(item.name ?? "", 60).toUpperCase();
    const safeSku = (item.sku ?? "").toString().trim();

    segments.push(
      `^CF0,24`,
      `^FO${offset + horizontalPadding},${topPadding}^FB${textBoxWidth},2,${lineSpacing},L,0^FD${safeName}^FS`,
      `^BY2,2,${barcodeHeightDots}`,
      `^FO${offset + horizontalPadding},${barcodeTop}^BCN,${barcodeHeightDots},Y,N,N`,
      `^FD${safeSku}^FS`
    );
  });

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

