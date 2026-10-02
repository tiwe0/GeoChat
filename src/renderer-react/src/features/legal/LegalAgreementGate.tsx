import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { LegalAgreementDialog } from "./LegalAgreementDialog";
import { acceptLegalAgreement, readLegalConsent } from "./legalConsent";
import { getLegalCopy } from "./legalDocuments";

const logger = createStructuredLogger("renderer.legal-agreement");

function initialConsent() {
  try {
    return { accepted: Boolean(readLegalConsent()), error: null };
  } catch {
    return { accepted: false, error: "load" as const };
  }
}

/** Do not mount the canvas or assistant until consent has been durably saved. */
export function LegalAgreementGate({ children, onExit }: { children: ReactNode; onExit: () => Promise<void> }) {
  const { i18n } = useTranslation();
  const copy = getLegalCopy(i18n.resolvedLanguage ?? i18n.language);
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"save" | "exit" | null>(null);
  const pendingRef = useRef(false);

  async function accept() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await acceptLegalAgreement();
      setConsent({ accepted: true, error: null });
    } catch (caught) {
      logger.warn("consent_save_failed", "LEGAL_CONSENT_SAVE_FAILED", { error: caught });
      setError("save");
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  async function decline() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onExit();
    } catch (caught) {
      logger.warn("consent_exit_failed", "LEGAL_CONSENT_EXIT_FAILED", { error: caught });
      setError("exit");
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  if (consent.accepted) return children;

  return (
    <LegalAgreementDialog
      open
      mode="consent"
      busy={busy}
      error={error === "save" ? copy.saveError : error === "exit" ? copy.exitError : consent.error ? copy.loadError : null}
      onAccept={() => void accept()}
      onDecline={() => void decline()}
    />
  );
}
