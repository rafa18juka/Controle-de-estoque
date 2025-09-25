"use client";

import { useEffect, useRef, useState } from "react";

import { BrowserMultiFormatReader, listVideoInputDevices } from "@zxing/browser";

const SECURE_CONTEXT_MESSAGE = "Use HTTPS ou localhost para liberar o acesso a camera.";

type ScannerStatus = "idle" | "initializing" | "ready" | "error";

interface BarcodeScannerProps {
  onResult: (value: string) => void;
  active: boolean;
  deviceId: string | null;
  onDevicesChange?: (devices: MediaDeviceInfo[]) => void;
  onSecureContextChange?: (secure: boolean) => void;
  onStatusChange?: (status: ScannerStatus) => void;
  onError?: (message: string | null) => void;
  className?: string;
}

export function BarcodeScanner({
  onResult,
  active,
  deviceId,
  onDevicesChange,
  onSecureContextChange,
  onStatusChange,
  onError,
  className
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastResultRef = useRef<{ value: string; timestamp: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [secureContext, setSecureContext] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const secure = window.isSecureContext;
    setSecureContext(secure);
    onSecureContextChange?.(secure);

    if (!secure) {
      setLocalError(SECURE_CONTEXT_MESSAGE);
      onError?.(SECURE_CONTEXT_MESSAGE);
      onDevicesChange?.([]);
      onStatusChange?.("idle");
      return;
    }

    setLocalError(null);
    onError?.(null);

    let cancelled = false;

    const loadDevices = async () => {
      try {
        const devices = await listVideoInputDevices();
        if (cancelled) return;
        onDevicesChange?.(devices);
      } catch (error) {
        if (cancelled) return;
        console.error("Nao foi possivel listar as cameras", error);
        const message = "Nao foi possivel listar as cameras disponiveis.";
        setLocalError(message);
        onError?.(message);
        onStatusChange?.("error");
      }
    };

    loadDevices();

    return () => {
      cancelled = true;
    };
  }, [onDevicesChange, onError, onSecureContextChange, onStatusChange]);

  useEffect(() => {
    if (!secureContext) {
      stopReader();
      return;
    }

    if (!active || !videoRef.current || !deviceId) {
      stopReader();
      setReady(false);
      onStatusChange?.("idle");
      return;
    }

    let cancelled = false;
    setReady(false);
    onStatusChange?.("initializing");
    readerRef.current ??= new BrowserMultiFormatReader();
    readerRef.current.reset();

    const videoElement = videoRef.current;

    readerRef.current
      .decodeFromVideoDevice(deviceId, videoElement, (result: any) => {
        if (!result) return;
        const raw = typeof result === "string" ? result : typeof result.getText === "function" ? result.getText() : "";
        const text = typeof raw === "string" ? raw.trim() : "";
        if (!text) return;
        const now = Date.now();
        const last = lastResultRef.current;
        if (last && last.value === text && now - last.timestamp < 1000) {
          return;
        }
        lastResultRef.current = { value: text, timestamp: now };
        onResult(text);
      })
      .then(() => {
        if (cancelled) return;
        setReady(true);
        onStatusChange?.("ready");
        setLocalError(null);
        onError?.(null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Erro ao iniciar o scanner", error);
        const message = error instanceof Error ? error.message : String(error);
        setLocalError(message);
        onError?.(message);
        onStatusChange?.("error");
      });

    return () => {
      cancelled = true;
      stopReader();
      onStatusChange?.("idle");
    };
  }, [active, deviceId, onResult, onError, onStatusChange, secureContext]);

  useEffect(() => {
    if (!active) {
      lastResultRef.current = null;
    }
  }, [active, deviceId]);

  const statusMessage = !secureContext
    ? SECURE_CONTEXT_MESSAGE
    : localError
      ? localError
      : ready
        ? "Camera pronta"
        : active
          ? "Iniciando camera..."
          : "Scanner pausado";

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900/70 p-2 shadow-inner">
        <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />
      </div>
      <span className="text-xs text-slate-500">{statusMessage}</span>
    </div>
  );

  function stopReader() {
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch (error) {
        console.warn("Falha ao resetar o scanner", error);
      }
    }
    if (videoRef.current) {
      const stream = videoRef.current.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }
}

