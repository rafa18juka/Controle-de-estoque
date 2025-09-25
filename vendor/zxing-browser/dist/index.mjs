const DEFAULT_FORMATS = ["code_128", "ean_13", "upc_a", "upc_e"];

class NotFoundException extends Error {
  constructor(message = "No barcode found in frame") {
    super(message);
    this.name = "NotFoundException";
  }
}

const normalizeFormat = (value) => {
  if (!value) return undefined;
  const lower = value.toString().toLowerCase();
  return lower.replace(/[^a-z0-9]/g, "_");
};

async function createDetector(options = {}) {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("Barcode detection is only available in the browser");
  }
  if (typeof window.BarcodeDetector === "undefined") {
    throw new Error(
      "BarcodeDetector API não suportada. Use Chrome/Edge recentes ou ative o scanner manualmente."
    );
  }
  const formats = (options.formats || DEFAULT_FORMATS)
    .map(normalizeFormat)
    .filter(Boolean);
  const detector = new window.BarcodeDetector({ formats });
  return detector;
}

class BrowserMultiFormatReader {
  constructor(options = {}) {
    this.options = options;
    this._detectorPromise = null;
    this._loopId = null;
    this._active = false;
    this._video = null;
    this._stream = null;
  }

  async decodeFromConstraints(constraints, videoElement, callback) {
    if (typeof window === "undefined") {
      throw new Error("BrowserMultiFormatReader so funciona no cliente");
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      throw new Error("APIs de media indisponiveis");
    }
    const video =
      typeof videoElement === "string"
        ? document.querySelector(videoElement)
        : videoElement;
    if (!video) {
      throw new Error("Elemento de video nao encontrado");
    }
    this._video = video;
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this._stream = stream;
    video.srcObject = stream;
    await video.play();
    this._detectorPromise = this._detectorPromise || createDetector(this.options);
    const detector = await this._detectorPromise;
    this._active = true;

    const tick = async () => {
      if (!this._active) return;
      try {
        const results = await detector.detect(video);
        if (!results || results.length === 0) {
          throw new NotFoundException();
        }
        const result = results[0];
        callback(result.rawValue, result);
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          console.debug("Scanner error", error);
        }
      }
      this._loopId = window.requestAnimationFrame(tick);
    };

    tick();
    return this;
  }

  async decodeFromVideoDevice(deviceId, videoElement, callback) {
    const constraints = {
      video: { facingMode: "environment" },
      audio: false
    };
    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }
    return this.decodeFromConstraints(constraints, videoElement, callback);
  }

  async decodeOnce() {
    throw new Error("decodeOnce não implementado nesta versão reduzida");
  }

  reset() {
    this._active = false;
    if (this._loopId) {
      window.cancelAnimationFrame(this._loopId);
      this._loopId = null;
    }
    if (this._video) {
      this._video.pause();
      this._video.srcObject = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
    }
  }
}

async function listVideoInputDevices() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

export { BrowserMultiFormatReader, NotFoundException, listVideoInputDevices };
