"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/protected-route";
import { RoleGate } from "@/components/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/components/providers/auth-provider";
import { getProductBySku, processStockOut, saveTrackingCode } from "@/lib/firestore";
import { parseTrackingCode } from "@/lib/tracking";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const BarcodeScanner = dynamic(() => import("@/components/barcode-scanner").then((mod) => mod.BarcodeScanner), {
  ssr: false
});

type ScannerStatus = "idle" | "initializing" | "ready" | "error";

const SECURE_CONTEXT_WARNING = "Use HTTPS ou localhost para acessar a camera.";
const SCANNER_TRIGGER_DELAY_MS = 1000;
const PREFERRED_CAMERA_PATTERNS = [/back/i, /rear/i, /environment/i, /traseira/i, /posterior/i];

function findPreferredCameraId(devices: MediaDeviceInfo[]): string | null {
  if (!devices.length) {
    return null;
  }
  for (const pattern of PREFERRED_CAMERA_PATTERNS) {
    const match = devices.find((device) => pattern.test(device.label));
    if (match?.deviceId) {
      return match.deviceId;
    }
  }
  const fallback = [...devices].reverse().find((device) => device.deviceId);
  return fallback?.deviceId ?? devices[0]?.deviceId ?? null;
}


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
  const secureToastShown = useRef(false);
  const scannerErrorRef = useRef<string | null>(null);
  const triggerTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [processing, setProcessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [secureContext, setSecureContext] = useState(true);
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>("idle");
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [processedProduct, setProcessedProduct] = useState<Product | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    skuInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!secureContext && !secureToastShown.current) {
      toast.warning(SECURE_CONTEXT_WARNING);
      secureToastShown.current = true;
    }
    if (secureContext) {
      secureToastShown.current = false;
    }
  }, [secureContext]);

  useEffect(() => {
    if (scannerError && scannerError !== scannerErrorRef.current) {
      toast.error(scannerError);
      scannerErrorRef.current = scannerError;
    }
    if (!scannerError) {
      scannerErrorRef.current = null;
    }
  }, [scannerError]);

  useEffect(() => {
    if (!devices.length) {
      setActiveDeviceId(null);
      return;
    }
    setActiveDeviceId((current) => {
      if (current && devices.some((device) => device.deviceId === current)) {
        return current;
      }
      return findPreferredCameraId(devices);
    });
  }, [devices]);

  useEffect(() => {
    if (!secureContext) {
      setScanning(false);
    }
  }, [secureContext]);

  useEffect(() => {
    return () => {
      if (triggerTimeoutRef.current) {
        window.clearTimeout(triggerTimeoutRef.current);
        triggerTimeoutRef.current = null;
      }
      const ctx = audioContextRef.current;
      if (ctx) {
        audioContextRef.current = null;
        ctx.close().catch(() => undefined);
      }
    };
  }, []);

  const playTone = useCallback((frequency: number, durationMs: number, type: OscillatorType = "sine") => {
    if (typeof window === "undefined") return;
    const AudioContextConstructor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
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
  }, []);

  const playSuccessTone = useCallback(() => {
    playTone(880, 160, "triangle");
  }, [playTone]);

  const playErrorTone = useCallback(() => {
    playTone(220, 240, "sawtooth");
  }, [playTone]);

  const handleDevicesChange = useCallback((list: MediaDeviceInfo[]) => {
    setDevices(list);
  }, []);

  const handleScannerStatus = useCallback((status: ScannerStatus) => {
    setScannerStatus(status);
  }, []);

  const handleScannerErrorMessage = useCallback((message: string | null) => {
    setScannerError(message);
    if (message) {
      playErrorTone();
    }
  }, [playErrorTone]);

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

      const qtyValue = Math.max(1, Number.parseInt(quantity, 10) || 1);

      setProcessing(true);

      try {
        const { product } = await processStockOut({
          sku: rawValue,
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
        const message = error instanceof Error ? error.message : "Falha ao registrar a baixa.";
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes("produto nao encontrado")) {
          const trackingCode = parseTrackingCode(rawValue);
          if (trackingCode) {
            try {
              const record = await saveTrackingCode({
                code: trackingCode,
                userId: user.uid,
                userName: user.displayName || user.email || "desconhecido"
              });
              setProcessedProduct(null);
              setPreviewProduct(null);
              setPreviewLoading(false);
              playSuccessTone();
              toast.success(`Codigo ${record.code} registrado.`);
              setSku("");
              setQuantity("1");
              skuInputRef.current?.focus();
              return;
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
        }

        playErrorTone();
        if (lowerMessage.includes("estoque insuficiente")) {
          toast.error("Estoque insuficiente.");
        } else if (lowerMessage.includes("usuario nao autenticado")) {
          toast.error("Usuario nao autenticado.");
        } else if (lowerMessage.includes("produto nao encontrado")) {
          toast.error("Produto nao encontrado ou codigo nao suportado.");
        } else {
          toast.error(message);
        }
      } finally {
        setProcessing(false);
      }
    },
    [playErrorTone, playSuccessTone, processing, quantity, sku, user]
  );

  const queueProcess = useCallback((value: string, delayMs: number = SCANNER_TRIGGER_DELAY_MS) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    setSku(cleaned);
    if (triggerTimeoutRef.current) {
      window.clearTimeout(triggerTimeoutRef.current);
      triggerTimeoutRef.current = null;
    }
    if (delayMs <= 0) {
      void handleProcess(cleaned);
      return;
    }
    triggerTimeoutRef.current = window.setTimeout(() => {
      triggerTimeoutRef.current = null;
      void handleProcess(cleaned);
    }, delayMs);
  }, [handleProcess]);

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
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        queueProcess(event.currentTarget.value);
      }
    },
    [queueProcess]
  );

  const handleQuantityChange = useCallback((value: string) => {
    setQuantity(value);
  }, []);

  const handleScannerResult = useCallback(
    (value: string) => {
      queueProcess(value, 0);
    },
    [queueProcess]
  );

  const handleScanToggle = useCallback(() => {
    if (!secureContext) {
      toast.warning(SECURE_CONTEXT_WARNING);
      return;
    }
    setScanning((prev) => {
      const next = !prev;
      if (next && devices.length === 0) {
        setActiveDeviceId(null);
      }
      return next;
    });
  }, [devices, secureContext]);

  const scannerStatusLabel = useMemo(() => {
    if (!secureContext) return "Camera indisponivel";
    switch (scannerStatus) {
      case "initializing":
        return "Iniciando camera...";
      case "ready":
        return "Camera pronta";
      case "error":
        return "Falha no scanner";
      default:
        return scanning ? "Scanner ativo" : "Scanner pausado";
    }
  }, [scannerStatus, secureContext, scanning]);

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
      <div className="flex flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-card lg:flex-row">
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Escanear codigo de barras</h2>
            <p className="text-sm text-slate-500">
              Use a camera para ler o codigo ou digite o SKU manualmente. Em conexoes HTTP, apenas a entrada manual fica ativa.
            </p>
          </div>
          {!secureContext && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {SECURE_CONTEXT_WARNING}
            </div>
          )}
          <BarcodeScanner
            active={!processing && scanning && secureContext}
            deviceId={activeDeviceId}
            onResult={handleScannerResult}
            onDevicesChange={handleDevicesChange}
            onSecureContextChange={setSecureContext}
            onStatusChange={handleScannerStatus}
            onError={handleScannerErrorMessage}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant={scanning && secureContext ? "default" : "outline"}
              onClick={handleScanToggle}
              disabled={processing || !secureContext}
            >
              {scanning && secureContext ? "Pausar scan" : "Iniciar scan"}
            </Button>
            <Select
              value={activeDeviceId ?? ""}
              onChange={(event) => setActiveDeviceId(event.target.value || null)}
              disabled={!secureContext || processing || devices.length === 0}
              className="sm:w-64"
            >
              <option value="">{devices.length === 0 ? "Nenhuma camera detectada" : "Trocar camera"}</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || "Camera"}
                </option>
              ))}
            </Select>
            <span className="text-xs text-slate-500 sm:ml-auto">{scannerStatusLabel}</span>
          </div>
        </div>

        <form className="w-full max-w-sm space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
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
