"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import { processStockOut, resolveSkuToParentAndMultiplier, saveTrackingCode } from "@/lib/firestore";
import type { Product, ProductKit, TrackingCodeProductLink, TrackingCodeRecord } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { parseTrackingCode } from "@/lib/tracking";

export default function ScanPage() {
  return (
    <ProtectedRoute>
      <RoleGate allow={["admin", "staff"]}>
        <ScanContent />
      </RoleGate>
    </ProtectedRoute>
  );
}

function ScanContent() {
  const { user } = useAuth();

  const skuInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [processing, setProcessing] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  // KIT-SKU START
  const [previewKit, setPreviewKit] = useState<ProductKit | null>(null);
  const [processedProduct, setProcessedProduct] = useState<Product | null>(null);
  const [processedKit, setProcessedKit] = useState<ProductKit | null>(null);
  const [lastEffectiveQty, setLastEffectiveQty] = useState<number | null>(null);
  const [lastScannedSku, setLastScannedSku] = useState<string | null>(null);
  // KIT-SKU END
  const [lastTrackingRecord, setLastTrackingRecord] = useState<TrackingCodeRecord | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    skuInputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      const ctx = audioContextRef.current;
      if (ctx) {
        audioContextRef.current = null;
        ctx.close().catch(() => undefined);
      }
    };
  }, []);

  const playTone = useCallback(
    (frequency: number, durationMs: number, type: OscillatorType = "sine") => {
      if (typeof window === "undefined") return;
      const AudioContextConstructor = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!AudioContextConstructor) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextConstructor();
      }
      const context = audioContextRef.current;
      if (!context) return;

      const start = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(context.destination);
        const now = context.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
        oscillator.start(now);
        oscillator.stop(now + durationMs / 1000 + 0.05);
      };

      if (context.state === "suspended") {
        void context.resume().then(start).catch(() => start());
      } else {
        start();
      }
    },
    []
  );

  const playSuccessTone = useCallback(() => {
    playTone(880, 160, "triangle");
  }, [playTone]);

  const playErrorTone = useCallback(() => {
    playTone(220, 240, "sawtooth");
  }, [playTone]);

  const handleProcess = useCallback(
    async (formSku?: string) => {
      const rawValue = (formSku ?? sku).trim();
      if (!rawValue) {
        playErrorTone();
        toast.error("Informe um SKU valido.");
        return;
      }

      if (!user) {
        playErrorTone();
        toast.error("Usuario nao autenticado.");
        return;
      }

      if (processing) {
        return;
      }

      const trackingCode = parseTrackingCode(rawValue);
      const qtyValue = Math.max(1, Number.parseInt(quantity, 10) || 1);

      setProcessing(true);

      if (trackingCode) {
        try {
          const record = await saveTrackingCode({
            code: trackingCode,
            userId: user.uid,
            userName: user.displayName || user.email || "desconhecido"
          });
          setLastTrackingRecord(record);
          setProcessedProduct(null);
          setProcessedKit(null);
          setLastEffectiveQty(null);
          setLastScannedSku(null);
          setPreviewProduct(null);
          setPreviewKit(null);
          setPreviewLoading(false);
          playSuccessTone();
          toast.success(`Codigo ${record.code} registrado.`);
          setSku("");
          setQuantity("1");
          skuInputRef.current?.focus();
        } catch (error) {
          playErrorTone();
          const message =
            error instanceof Error ? error.message : "Falha ao registrar o codigo de rastreamento.";
          toast.error(message);
        } finally {
          setProcessing(false);
        }
        return;
      }

      try {
        const { product, kit: resultKit, effectiveQty, scannedSku } = await processStockOut({
          sku: rawValue,
          qty: qtyValue,
          userId: user.uid,
          userName: user.displayName || user.email || "desconhecido"
        });

        setProcessedProduct(product);
        setProcessedKit(resultKit);
        setLastEffectiveQty(effectiveQty);
        setLastScannedSku(scannedSku);
        setPreviewProduct(null);
        setPreviewKit(null);
        setPreviewLoading(false);
        setLastTrackingRecord(null);
        playSuccessTone();
        const kitName = resultKit?.label && resultKit.label.trim().length ? resultKit.label : resultKit?.sku;
        if (resultKit) {
          toast.success(`Kit ${kitName ?? product.sku} baixou ${effectiveQty} unidade(s).`);
        } else {
          toast.success(`Baixa de ${effectiveQty} unidade(s).`);
        }
        setSku("");
        setQuantity("1");
        skuInputRef.current?.focus();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao registrar a baixa.";
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes("produto nao encontrado")) {
          try {
            const detectedTracking = parseTrackingCode(rawValue);
            if (detectedTracking) {
              const record = await saveTrackingCode({
                code: detectedTracking,
                userId: user.uid,
                userName: user.displayName || user.email || "desconhecido"
              });
              setProcessedProduct(null);
              setProcessedKit(null);
              setLastEffectiveQty(null);
              setLastScannedSku(null);
              setPreviewProduct(null);
              setPreviewKit(null);
              setPreviewLoading(false);
              setLastTrackingRecord(record);
              playSuccessTone();
              toast.success(`Codigo ${record.code} registrado.`);
              setSku("");
              setQuantity("1");
              skuInputRef.current?.focus();
              return;
            }
          } catch (trackingError) {
            const trackingMessage =
              trackingError instanceof Error
                ? trackingError.message
                : "Falha ao registrar o codigo de rastreamento.";
            playErrorTone();
            toast.error(trackingMessage);
            return;
          }
        }

        playErrorTone();
        if (lowerMessage.includes("estoque insuficiente")) {
          toast.error("Estoque insuficiente.");
        } else if (lowerMessage.includes("usuario nao autenticado")) {
          toast.error("Usuario nao autenticado.");
        } else {
          toast.error(message);
        }
      } finally {
        setProcessing(false);
      }
    },
    [playErrorTone, playSuccessTone, processing, quantity, sku, user]
  );

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      await handleProcess();
    },
    [handleProcess]
  );

  const handleSkuChange = useCallback((value: string) => {
    setSku(value);
  }, []);

  const handleSkuKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleProcess(event.currentTarget.value);
      }
    },
    [handleProcess]
  );

  const handleQuantityChange = useCallback((value: string) => {
    setQuantity(value);
  }, []);

  useEffect(() => {
    const trimmed = sku.trim();
    if (!trimmed) {
      setPreviewProduct(null);
      setPreviewKit(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const resolved = await resolveSkuToParentAndMultiplier(trimmed);
        if (!cancelled) {
          setPreviewProduct(resolved?.product ?? null);
          setPreviewKit(resolved?.kit ?? null);
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [sku]);

  const productDetails = useMemo(() => {
    const trimmedSku = sku.trim();
    const isPreview = Boolean(trimmedSku);
    const product = (isPreview ? previewProduct : processedProduct) ?? null;
    if (!product) return null;

    const kit = isPreview ? previewKit : processedKit;
    const scannedValue = isPreview ? trimmedSku : lastScannedSku ?? product.sku;
    const effectiveQtyDisplay = !isPreview && lastEffectiveQty ? lastEffectiveQty : null;
    const kitLabel = kit?.label && kit.label.trim().length ? kit.label : kit?.sku;

    return (
      <div className="card space-y-2">
        <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <span className="font-medium text-slate-500">SKU pai:</span> {product.sku}
          </div>
          <div>
            <span className="font-medium text-slate-500">Preco:</span> {formatCurrency(product.unitPrice)}
          </div>
          <div>
            <span className="font-medium text-slate-500">Categoria:</span> {product.category ?? "-"}
          </div>
          <div>
            <span className="font-medium text-slate-500">Fornecedor:</span> {product.supplier ?? "-"}
          </div>
          <div>
            <span className="font-medium text-slate-500">Estoque atual:</span> {product.quantity}
          </div>
          <div>
            <span className="font-medium text-slate-500">Valor total:</span> {formatCurrency(product.totalValue)}
          </div>
          <div>
            <span className="font-medium text-slate-500">SKU escaneado:</span> {scannedValue || "-"}
          </div>
          {kit ? (
            <>
              <div>
                <span className="font-medium text-slate-500">Multiplicador:</span> x{kit.multiplier}
              </div>
              <div className="sm:col-span-2">
                <span className="font-medium text-slate-500">Kit:</span> {kitLabel}
              </div>
            </>
          ) : null}
          {!isPreview && effectiveQtyDisplay ? (
            <div className="sm:col-span-2">
              <span className="font-medium text-slate-500">Ultima baixa:</span> {effectiveQtyDisplay} unidade(s)
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [lastEffectiveQty, lastScannedSku, previewKit, previewProduct, processedKit, processedProduct, sku]);

  const trackingDetails = useMemo(() => {
    if (!lastTrackingRecord) return null;

    const timestampLabel = lastTrackingRecord.createdAt
      ? new Date(lastTrackingRecord.createdAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "-";

    const productLinks: TrackingCodeProductLink[] =
      lastTrackingRecord.products && lastTrackingRecord.products.length
        ? lastTrackingRecord.products
        : lastTrackingRecord.productSku
          ? [
              {
                sku: lastTrackingRecord.productSku,
                name: lastTrackingRecord.productName ?? undefined
              }
            ]
          : [];

    return (
      <div className="card space-y-2">
        <h3 className="text-lg font-semibold text-slate-900">Ultimo rastreio salvo</h3>
        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="font-medium text-slate-500">Codigo:</span>{" "}
            <span className="font-mono text-xs uppercase">{lastTrackingRecord.code}</span>
          </div>
          <div>
            <span className="font-medium text-slate-500">Registrado em:</span> {timestampLabel}
          </div>
          <div>
            <span className="font-medium text-slate-500">Operador:</span> {lastTrackingRecord.userName || lastTrackingRecord.userId}
          </div>
          <div className="sm:col-span-2 space-y-1">
            <span className="font-medium text-slate-500">Produtos vinculados:</span>
            {productLinks.length ? (
              <ul className="space-y-1">
                {productLinks.map((item, index) => (
                  <li
                    key={`${item.sku}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600"
                  >
                    <span className="font-mono uppercase text-slate-700">{item.sku}</span>
                    <span>
                      {item.name ?? "-"}
                      {typeof item.quantity === "number" ? ` | ${item.quantity} un.` : ""}
                      {item.scannedSku && item.scannedSku !== item.sku ? ` | escaneado: ${item.scannedSku}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-slate-500">Nenhum produto vinculado.</span>
            )}
          </div>
        </div>
      </div>
    );
  }, [lastTrackingRecord]);

  return (
    <div className="space-y-8">
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">Registrar baixa por codigo</h2>
          <p className="text-sm text-slate-500">
            Digite o codigo (SKU ou QR) manualmente ou utilize um leitor fisico que atua como teclado para preencher o campo abaixo. Captura por camera foi desativada.
          </p>
        </div>
        <form className="w-full max-w-sm space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="sku">Codigo (SKU ou QR)</Label>
            <Input
              id="sku"
              ref={skuInputRef}
              autoComplete="off"
              autoFocus
              value={sku}
              placeholder="000000000000"
              onChange={(event) => handleSkuChange(event.target.value)}
              onKeyDown={handleSkuKeyDown}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantidade</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              inputMode="numeric"
              value={quantity}
              onChange={(event) => handleQuantityChange(event.target.value)}
            />
            <p className="text-xs text-slate-500">Se vazio ou 0, usa valor padrao 1.</p>
          </div>
          <Button type="submit" className="w-full" disabled={processing || !sku.trim()}>
            {processing ? "Processando..." : "Dar baixa"}
          </Button>
          {previewLoading && <p className="text-sm text-slate-500">Buscando produto...</p>}
        </form>
      </div>
      {productDetails}
      {trackingDetails}
    </div>
  );
}
