type CanvasExport = { base64: string; mimeType: "image/png" | "application/vnd.geogebra.file"; filename: string };

export interface CanvasDownloadPort {
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  download(url: string, filename: string): void;
  defer(cleanup: () => void): void;
}

/** Export through the shell, without enabling GeoGebra's browser-owned file store. */
export function downloadCanvasExport(file: CanvasExport, port: CanvasDownloadPort = browserDownloadPort()) {
  const binary = atob(file.base64);
  if (!binary.length) throw new Error("GeoGebra returned an empty export.");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = port.createUrl(new Blob([bytes], { type: file.mimeType }));
  try {
    port.download(url, file.filename);
  } finally {
    // Let the WebView consume the URL before releasing its backing bytes.
    port.defer(() => port.revokeUrl(url));
  }
}

function browserDownloadPort(): CanvasDownloadPort {
  return {
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    download: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
    },
    defer: (cleanup) => { globalThis.setTimeout(cleanup, 1000); },
  };
}
