"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BrowserMultiFormatReader, listVideoInputDevices } from "@zxing/browser";
import { Button } from "@/components/ui/button";

const SECURE_CONTEXT_MESSAGE = "O leitor de codigo de barras requer HTTPS ou localhost para acessar a camera.";

interface BarcodeScannerProps {
  onResult: (value: string) => void;
  paused?: boolean;
}

export function BarcodeScanner({ onResult, paused = false }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secureContext, setSecureContext] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      if (typeof window === "undefined") {
        return;
      }

      if (!window.isSecureContext) {
        setSecureContext(false);
        setReady(false);
        setCameras([]);
        setActiveDeviceId(null);
        const message = SECURE_CONTEXT_MESSAGE;
        setError(message);
        if (!cancelled) {
          toast.warning(message);
        }
        return;
      }

      setSecureContext(true);
      setError(null);

      try {
        const devices = await listVideoInputDevices();
        if (cancelled) return;
        setCameras(devices);
        const deviceId = devices[0]?.deviceId ?? null;
        setActiveDeviceId((prev) => prev ?? deviceId);
      } catch (err) {
        console.error(err);
        const message = "Nao foi possivel listar as cameras disponiveis";
        setError(message);
        toast.error(message);
      }
    };

    prepare();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!secureContext) {
      if (readerRef.current) {
        readerRef.current.reset();
        readerRef.current = null;
      }
      return;
    }

    if (!videoRef.current || !activeDeviceId || paused) {
      if (readerRef.current) {
        readerRef.current.reset();
        setReady(false);
      }
      return;
    }

    const reader = new BrowserMultiFormatReader({ formats: ["code_128", "ean_13"] });
    readerRef.current = reader;

    reader
      .decodeFromVideoDevice(activeDeviceId, videoRef.current, (value) => {
        if (value) {
          onResult(value);
        }
      })
      .then(() => setReady(true))
      .catch((err) => {
        console.error("Erro ao iniciar scanner", err);
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error("Falha ao iniciar o leitor de codigo de barras");
      });

    return () => {
      reader.reset();
    };
  }, [activeDeviceId, onResult, paused, secureContext]);

  const changeCamera = (deviceId: string) => {
    if (!secureContext || deviceId === activeDeviceId) return;
    setReady(false);
    setActiveDeviceId(deviceId);
  };

  return (
    <div className="flex flex-col gap-4">
      {!secureContext ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Conecte-se via HTTPS (ou use localhost) para liberar a camera.
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900/70 p-2 shadow-inner">
        <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {cameras.map((camera) => (
          <Button
            key={camera.deviceId || camera.label}
            type="button"
            variant={camera.deviceId === activeDeviceId ? "default" : "outline"}
            size="sm"
            onClick={() => changeCamera(camera.deviceId)}
            disabled={!secureContext}
          >
            {camera.label || "Camera"}
          </Button>
        ))}
        {!cameras.length && secureContext && (
          <span className="text-sm text-slate-500">Nenhuma camera detectada</span>
        )}
        <span className="ml-auto text-sm text-slate-500">
          {error ? error : ready ? "Camera pronta" : secureContext ? "Preparando camera..." : "Camera bloqueada"}
        </span>
      </div>
    </div>
  );
}

