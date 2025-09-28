"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { LabelItem } from "@/lib/zpl";
import { Check, Copy } from "lucide-react";

interface ZplPreviewProps {
  zpl: string;
  items: LabelItem[];
  widthMm?: number;
  heightMm?: number;
  columns?: number;
  columnGapMm?: number;
  fileName?: string;
  note?: string;
}

export function ZPLPreview({
  zpl,
  items,
  widthMm = 40,
  heightMm = 20,
  columns = 1,
  columnGapMm = 0,
  fileName,
  note
}: ZplPreviewProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scale = 4; // preview scale
  const columnCount = Math.max(1, columns);
  const columnPreviewWidth = Math.round(widthMm * scale);
  const previewHeight = Math.round(heightMm * scale);
  const gapPx = Math.max(0, Math.round(columnGapMm * scale));
  const totalPreviewWidth = columnPreviewWidth * columnCount + gapPx * Math.max(0, columnCount - 1);
  const columnLabel = columnCount > 1 ? `${columnCount} colunas` : "1 coluna";

  useEffect(() => {
    const blob = new Blob([zpl], { type: "text/plain" });
    const objectUrl = URL.createObjectURL(blob);
    setDownloadUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [zpl]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const previewItems = useMemo(() => {
    return Array.from({ length: columnCount }, (_, index) => items[index] ?? null);
  }, [columnCount, items]);

  const lines = useMemo(() => zpl.split("\n"), [zpl]);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(zpl);
        setCopied(true);
      } else {
        throw new Error("Clipboard API not available");
      }
    } catch (error) {
      console.error("Failed to copy ZPL", error);
    }
  };

  const primarySku = items[0]?.sku ?? "labels";

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Pre-visualizacao</h3>
          <p className="text-sm text-slate-500">
            Escala aproximada por etiqueta {widthMm} x {heightMm} mm ({columnLabel}).
          </p>
        </div>
        <div
          className="relative rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3"
          style={{ width: totalPreviewWidth, height: previewHeight }}
        >
          <div className="flex h-full" style={{ gap: `${gapPx}px` }}>
            {previewItems.map((item, index) => (
              <div
                key={index}
                className="flex h-full flex-col justify-between rounded-md bg-white px-3 py-2 shadow-sm"
                style={{ width: `${columnPreviewWidth}px` }}
              >
                {item ? (
                  <>
                    <div
                      className="text-[11px] font-semibold uppercase leading-tight text-slate-700"
                      style={{ maxHeight: "36px", overflow: "hidden" }}
                    >
                      {item.name}
                    </div>
                    <div className="flex flex-1 items-center justify-center">
                      <div className="h-14 w-full rounded-sm border border-slate-200 bg-[repeating-linear-gradient(90deg,#0f172a,#0f172a_2px,transparent_2px,transparent_4px)]" />
                    </div>
                    <div className="text-center text-[11px] font-mono tracking-widest text-slate-600">{item.sku}</div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-slate-400">Coluna vazia</div>
                )}
              </div>
            ))}
          </div>
        </div>
        {note ? <p className="text-xs text-slate-500">{note}</p> : null}
        {downloadUrl ? (
          <Button asChild>
            <a href={downloadUrl} download={`${fileName ?? primarySku}.zpl`}>
              Baixar .zpl
            </a>
          </Button>
        ) : null}
      </div>
      <div className="space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Codigo ZPL</h3>
            <p className="text-sm text-slate-500">Copie ou ajuste conforme necessario.</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                Copiar
              </>
            )}
          </Button>
        </div>
        <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900/90 p-4 text-xs text-emerald-200">
          <code>{lines.join("\n")}</code>
        </pre>
      </div>
    </div>
  );
}
