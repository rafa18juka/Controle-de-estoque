"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import { getProductBySku, processStockOut } from "@/lib/firestore";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

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
  const [processedProduct, setProcessedProduct] = useState<Product | null>(null);
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
      const targetSku = (formSku ?? sku).trim();
      if (!targetSku) {
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

      const qtyValue = Math.max(1, Number.parseInt(quantity, 10) || 1);

      setProcessing(true);

      try {
        const { product } = await processStockOut({
          sku: targetSku,
          qty: qtyValue,
          userId: user.uid,
          userName: user.displayName || user.email || "desconhecido"
        });

        setProcessedProduct(product);
        setPreviewProduct(null);
        setPreviewLoading(false);
        playSuccessTone();
        toast.success("Baixa realizada.");
        setSku("");
        setQuantity("1");
        skuInputRef.current?.focus();
      } catch (error) {
        playErrorTone();
        const message = error instanceof Error ? error.message : "Falha ao registrar a baixa.";
        if (message.toLowerCase().includes("estoque insuficiente")) {
          toast.error("Estoque insuficiente.");
        } else if (message.toLowerCase().includes("produto nao encontrado")) {
          toast.error("SKU nao encontrado.");
        } else if (message.toLowerCase().includes("usuario nao autenticado")) {
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
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const product = await getProductBySku(trimmed);
        if (!cancelled) {
          setPreviewProduct(product);
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
    const product = previewProduct ?? (trimmedSku ? null : processedProduct);
    if (!product) return null;
    return (
      <div className="card space-y-2">
        <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <span className="font-medium text-slate-500">SKU:</span> {product.sku}
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
        </div>
      </div>
    );
  }, [previewProduct, processedProduct, sku]);

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
    </div>
  );
}
