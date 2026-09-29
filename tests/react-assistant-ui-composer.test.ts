import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGeoChatAttachmentAdapter } from "../src/renderer-react/src/features/assistant-ui/attachmentAdapter";

const root = join(import.meta.dir, "../src/renderer-react/src/features/assistant-ui");

describe("assistant-ui GeoChat composer", () => {
  test("uses assistant-ui primitives for the complete input lifecycle", () => {
    const source = readFileSync(join(root, "GeoChatComposer.tsx"), "utf8");
    expect(source).toContain("<ComposerPrimitive.Root");
    expect(source).toContain("<ComposerPrimitive.Input");
    expect(source).toContain("<ComposerPrimitive.Send");
    expect(source).toContain("<ComposerPrimitive.Cancel");
    expect(source).toContain("<ComposerPrimitive.AddAttachment");
    expect(source).toContain("<ComposerPrimitive.AttachmentDropzone");
    expect(source).toContain("unstable_useComposerInputHistory");
    expect(source).toContain('submitMode="enter"');
    expect(source).not.toContain("requestSubmit()");
  });

  test("keeps presentation-specific styling outside the assistant-ui runtime", () => {
    const source = readFileSync(join(root, "GeoChatComposer.tsx"), "utf8");
    expect(source).toContain('export type GeoChatComposerVariant = "window" | "fusion"');
    expect(source).toContain("modelControl?: ReactNode");
    expect(source).toContain("export type GeoChatComposerSx");
    expect(source).toContain("focusSignal");
  });

  test("validates duplicate, type, item size and item count through one adapter", async () => {
    const adapter = createGeoChatAttachmentAdapter({
      duplicateFile: () => "duplicate",
      fileTooLarge: () => "too-large",
      tooManyFiles: () => "too-many",
      unsupportedFile: () => "unsupported",
    });
    await expect(adapter.add({ file: new File(["x"], "a.txt", { type: "text/plain" }) })).rejects.toThrow("unsupported");

    const image = new File(["x"], "a.png", { type: "image/png", lastModified: 1 });
    const first = await adapter.add({ file: image });
    await expect(adapter.add({ file: image })).rejects.toThrow("duplicate");
    await adapter.remove(first);
    const oversized = { name: "huge.png", type: "image/png", size: 10 * 1024 * 1024 + 1, lastModified: 2 } as File;
    await expect(adapter.add({ file: oversized })).rejects.toThrow("too-large");

    const accepted = await Promise.all(Array.from({ length: 4 }, (_, index) => adapter.add({
      file: new File(["x"], `${index}.png`, { type: "image/png", lastModified: index }),
    })));
    await expect(adapter.add({
      file: new File(["x"], "overflow.png", { type: "image/png", lastModified: 9 }),
    })).rejects.toThrow("too-many");
    await Promise.all(accepted.map((attachment) => adapter.remove(attachment)));
  });

  test("enforces the aggregate attachment budget before accepting a file", async () => {
    const adapter = createGeoChatAttachmentAdapter({ totalTooLarge: "total-too-large" });
    const fakeImage = (name: string, size: number) => ({
      name,
      size,
      type: "image/png",
      lastModified: Number(name[0]) || 0,
    }) as File;
    const pending = await Promise.all([
      adapter.add({ file: fakeImage("1.png", 8 * 1024 * 1024) }),
      adapter.add({ file: fakeImage("2.png", 8 * 1024 * 1024) }),
    ]);
    await expect(adapter.add({ file: fakeImage("3.png", 5 * 1024 * 1024) })).rejects.toThrow("total-too-large");
    await Promise.all(pending.map((attachment) => adapter.remove(attachment)));
  });

  test("converts accepted images to complete assistant-ui content and releases the reservation", async () => {
    const adapter = createGeoChatAttachmentAdapter();
    const file = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
    const pending = await adapter.add({ file });
    const complete = await adapter.send(pending);
    expect(complete.status.type).toBe("complete");
    expect(complete.content[0]).toMatchObject({ type: "image", filename: "image.png" });
    expect((complete.content[0] as { image: string }).image).toStartWith("data:image/png;base64,");
    await expect(adapter.add({ file })).resolves.toBeDefined();
  });
});
