export interface BrowserReaderOptions {
  formats?: string[];
}

declare class BrowserMultiFormatReader {
  constructor(options?: BrowserReaderOptions);
  decodeFromConstraints(
    constraints: MediaStreamConstraints,
    videoElement: HTMLVideoElement | string,
    callback: (result: string, rawResult: unknown) => void
  ): Promise<BrowserMultiFormatReader>;
  decodeFromVideoDevice(
    deviceId: string | null,
    videoElement: HTMLVideoElement | string,
    callback: (result: string, rawResult: unknown) => void
  ): Promise<BrowserMultiFormatReader>;
  decodeOnce(): Promise<never>;
  reset(): void;
}

declare class NotFoundException extends Error {}

export declare function listVideoInputDevices(): Promise<MediaDeviceInfo[]>;

export { BrowserMultiFormatReader, NotFoundException };
