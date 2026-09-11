type ClipboardFileItem = {
  kind: string;
  type: string;
  getAsFile: () => File | null;
};

export function imageFilesFromClipboard(input: {
  items: Iterable<ClipboardFileItem>;
  files: Iterable<File>;
}) {
  const itemFiles = Array.from(input.items).flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  const candidates = itemFiles.length ? itemFiles : Array.from(input.files);
  return candidates.filter((file) => file.type.startsWith("image/"));
}

export function insertTextAtSelection(value: string, text: string, start: number | null, end: number | null) {
  const selectionStart = start ?? value.length;
  const selectionEnd = end ?? selectionStart;
  return {
    value: value.slice(0, selectionStart) + text + value.slice(selectionEnd),
    cursor: selectionStart + text.length,
  };
}
