import {
  generateId,
  type Attachment,
  type AttachmentAdapter,
  type CompleteAttachment,
  type PendingAttachment,
} from "@assistant-ui/react";
import {
  AGENT_ATTACHMENT_ACCEPT,
  MAX_AGENT_FILE_COUNT,
  MAX_AGENT_FILE_SIZE,
  MAX_AGENT_TOTAL_FILE_SIZE,
  isSupportedAgentFile,
} from "../attachments/capabilities";

export type GeoChatAttachmentAdapterLabels = {
  duplicateFile: (name: string) => string;
  fileReadFailed: string;
  fileTooLarge: (name: string) => string;
  tooManyFiles: (count: number) => string;
  totalTooLarge: string;
  unsupportedFile: (name: string) => string;
};

const DEFAULT_LABELS: GeoChatAttachmentAdapterLabels = {
  duplicateFile: (name) => `文件 ${name} 已添加。`,
  fileReadFailed: "读取附件失败。",
  fileTooLarge: (name) => `文件 ${name} 过大。`,
  tooManyFiles: (count) => `最多只能添加 ${count} 个附件。`,
  totalTooLarge: "附件总大小超出限制。",
  unsupportedFile: (name) => `不支持文件 ${name}。`,
};

function fileSignature(file: Pick<File, "lastModified" | "name" | "size">) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
function abortError(signal: AbortSignal | undefined) {
  if (signal?.reason !== undefined) return signal.reason;
  const error = new Error("The attachment read was aborted");
  error.name = "AbortError";
  return error;
}

function fileToDataUrl(
  file: File,
  failureMessage: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (typeof FileReader === "undefined") {
    return file.arrayBuffer().then((buffer) => {
      if (signal?.aborted) throw abortError(signal);
      const bytes = new Uint8Array(buffer);
      const nodeBuffer = globalThis as typeof globalThis & {
        Buffer?: { from(value: Uint8Array): { toString(encoding: "base64"): string } };
      };
      let base64: string;
      if (nodeBuffer.Buffer) {
        base64 = nodeBuffer.Buffer.from(bytes).toString("base64");
      } else {
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        base64 = btoa(binary);
      }
      return `data:${file.type || "application/octet-stream"};base64,${base64}`;
    });
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const handleAbort = () => {
      reader.abort();
      reject(abortError(signal));
    };
    const cleanUp = () => signal?.removeEventListener("abort", handleAbort);
    reader.onload = () => {
      cleanUp();
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(failureMessage));
    };
    reader.onerror = () => {
      cleanUp();
      reject(new Error(failureMessage, { cause: reader.error }));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    reader.readAsDataURL(file);
  });
}

/**
 * Creates the attachment boundary used by assistant-ui's composer runtime.
 *
 * Validation happens before assistant-ui accepts an attachment, so picker,
 * paste and drop paths all share the same limits. Reservations are released on
 * remove or after send, preventing count/size state from leaking between turns.
 */
export function createGeoChatAttachmentAdapter(
  labels: Partial<GeoChatAttachmentAdapterLabels> = {},
): AttachmentAdapter {
  const text = { ...DEFAULT_LABELS, ...labels };
  const reservations = new Map<string, { signature: string; size: number }>();

  const release = (attachment: Pick<Attachment, "id">) => {
    reservations.delete(attachment.id);
  };

  return {
    accept: AGENT_ATTACHMENT_ACCEPT,
    async add({ file }): Promise<PendingAttachment> {
      const signature = fileSignature(file);
      if ([...reservations.values()].some((entry) => entry.signature === signature)) {
        throw new Error(text.duplicateFile(file.name));
      }
      if (!isSupportedAgentFile(file)) throw new Error(text.unsupportedFile(file.name));
      if (file.size > MAX_AGENT_FILE_SIZE) throw new Error(text.fileTooLarge(file.name));
      if (reservations.size >= MAX_AGENT_FILE_COUNT) {
        throw new Error(text.tooManyFiles(MAX_AGENT_FILE_COUNT));
      }
      const totalSize = [...reservations.values()].reduce((sum, entry) => sum + entry.size, 0);
      if (totalSize + file.size > MAX_AGENT_TOTAL_FILE_SIZE) throw new Error(text.totalTooLarge);

      const id = generateId();
      reservations.set(id, { signature, size: file.size });
      return {
        id,
        type: "image",
        name: file.name,
        contentType: file.type,
        file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    },
    async remove(attachment) {
      release(attachment);
    },
    async send(attachment, options): Promise<CompleteAttachment> {
      try {
        return {
          ...attachment,
          status: { type: "complete" },
          content: [{
            type: "image",
            image: await fileToDataUrl(attachment.file, text.fileReadFailed, options?.signal),
            filename: attachment.name,
          }],
        };
      } finally {
        release(attachment);
      }
    },
  };
}
