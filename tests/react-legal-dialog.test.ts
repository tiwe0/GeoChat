import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  new URL("../src/renderer-react/src/features/legal/LegalAgreementDialog.tsx", import.meta.url),
  "utf8",
);

describe("legal agreement dialog", () => {
  test("blocks every dismissal path while consent is required", () => {
    expect(dialogSource).toContain('mode: "consent" | "review"');
    expect(dialogSource).toContain("if (isConsent) return;");
    expect(dialogSource).toContain('reason === "escapeKeyDown" || reason === "backdropClick"');
    expect(dialogSource).not.toContain("<IconButton");
  });

  test("requires explicit acknowledgment and disables consent controls while saving", () => {
    expect(dialogSource).toContain('useState(false)');
    expect(dialogSource).toContain("disabled={!acknowledged || busy}");
    expect(dialogSource).toContain("disabled={busy}");
    expect(dialogSource).toContain("onClick={onDecline}");
    expect(dialogSource).toContain("onClick={onAccept}");
    expect(dialogSource).toContain("aria-busy={busy || undefined}");
    expect(dialogSource).toContain('<Alert severity="error" role="alert"');
    expect(dialogSource).not.toContain("scrollHeight");
  });

  test("keeps both localized documents readable in an internal scroll region", () => {
    expect(dialogSource).toContain("getLegalCopy(i18n.resolvedLanguage ?? i18n.language)");
    expect(dialogSource).toContain("copy.privacySections : copy.termsSections");
    expect(dialogSource).toContain('role="tabpanel"');
    expect(dialogSource).toContain('tabIndex={0}');
    expect(dialogSource).toContain('overflowY: "auto"');
    expect(dialogSource).toContain("LEGAL_DOCUMENT_UPDATED_AT");
    expect(dialogSource).toContain("minHeight: 0");
    expect(dialogSource).toContain("flexShrink: 0");
    expect(dialogSource).toContain("key={activeDocument}");
  });

  test("allows review mode to close through its button, Escape, or backdrop", () => {
    expect(dialogSource).toContain("onClose?.();");
    expect(dialogSource).toContain("onClick={onClose}");
    expect(dialogSource).toContain("{copy.closeLabel}");
    expect(dialogSource).toContain("zIndex: LEGAL_DIALOG_Z_INDEX");
    expect(dialogSource).toContain("const LEGAL_DIALOG_Z_INDEX = 1700;");
  });
});
