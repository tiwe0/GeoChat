import type { GeoGebraDocumentMetadata } from "@geochat-ai/app/geogebra-documents";
import { CircularProgress } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { backendAuthToken, backendOrigin } from "../desktop/runtime";
import type { GeoGebraController } from "../../geogebra/controller";
import { GeoGebraDocumentWorkspace, mergeGeoGebraDocumentPages } from "./documentStorage";

const DOCUMENT_PAGE_SIZE = 100;
const DOCUMENT_FETCH_SIZE = DOCUMENT_PAGE_SIZE + 1;

type Props = {
  controller: GeoGebraController;
  open: boolean;
  blocked: boolean;
  onClose(): void;
};

export function GeoGebraDocumentPanel({ controller, open, blocked, onClose }: Props) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<GeoGebraDocumentMetadata[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspace = useMemo(() => new GeoGebraDocumentWorkspace(
    backendOrigin(),
    backendAuthToken(),
    {
      captureDocumentBase64: () => controller.captureDocumentBase64(),
      restoreDocumentBase64: (base64) => controller.restoreDocumentBase64(base64),
    },
  ), [controller]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const page = await workspace.list({ limit: DOCUMENT_FETCH_SIZE, offset: 0 });
      setDocuments(mergeGeoGebraDocumentPages([], page.slice(0, DOCUMENT_PAGE_SIZE)));
      setHasMore(page.length > DOCUMENT_PAGE_SIZE);
    } catch (caughtError) {
      setError(message(caughtError));
    }
  }, [workspace]);

  function loadMore() {
    void run(async () => {
      const page = await workspace.list({ limit: DOCUMENT_FETCH_SIZE, offset: documents.length });
      setDocuments((current) => mergeGeoGebraDocumentPages(current, page.slice(0, DOCUMENT_PAGE_SIZE)));
      setHasMore(page.length > DOCUMENT_PAGE_SIZE);
    });
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError(t("documents.titleRequired"));
      return;
    }
    void run(async () => {
      const document = await workspace.save({
        id: currentId ?? crypto.randomUUID(),
        title: normalizedTitle,
      });
      setCurrentId(document.id);
      setTitle(document.title);
      await refresh();
    });
  }

  function openDocument(document: GeoGebraDocumentMetadata) {
    void run(async () => {
      const loaded = await workspace.open(document.id);
      setCurrentId(loaded.id);
      setTitle(loaded.title);
      onClose();
    });
  }

  function deleteDocument(document: GeoGebraDocumentMetadata) {
    if (!window.confirm(t("documents.deleteConfirm", { title: document.title }))) return;
    void run(async () => {
      await workspace.delete(document.id);
      if (currentId === document.id) {
        setCurrentId(null);
        setTitle("");
      }
      await refresh();
    });
  }

  if (!open) return null;
  return (
    <aside className="geogebra-document-panel" aria-label={t("documents.title")}>
      <header>
        <strong>{t("documents.title")}</strong>
        <div>
          <button
            type="button"
            onClick={() => {
              setCurrentId(null);
              setTitle("");
              setError(null);
            }}
            disabled={busy || blocked}
          >
            {t("documents.new")}
          </button>
          <button type="button" onClick={onClose} aria-label={t("documents.close")}>×</button>
        </div>
      </header>
      <div className="geogebra-document-save-row">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("documents.name")}
          aria-label={t("documents.name")}
          disabled={busy || blocked}
        />
        <button type="button" onClick={save} disabled={busy || blocked || !controller.ready}>{t("documents.save")}</button>
      </div>
      <p className="geogebra-document-storage-note">{t("documents.storageNote")}</p>
      {error && <p className="geogebra-document-error" role="alert">{error}</p>}
      {busy && <div className="geogebra-document-loading"><CircularProgress size={18} /></div>}
      {!busy && documents.length === 0 && <p className="geogebra-document-empty">{t("documents.empty")}</p>}
      <ul>
        {documents.map((document) => (
          <li key={document.id} className={document.id === currentId ? "is-current" : undefined}>
            <button type="button" className="geogebra-document-open" onClick={() => openDocument(document)} disabled={busy || blocked}>
              <span>{document.title}</span>
              <small>{new Date(document.updatedAt).toLocaleString()}</small>
            </button>
            <button
              type="button"
              className="geogebra-document-delete"
              onClick={() => deleteDocument(document)}
              disabled={busy || blocked}
              aria-label={t("documents.deleteLabel", { title: document.title })}
            >
              {t("documents.delete")}
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" className="geogebra-document-load-more" onClick={loadMore} disabled={busy || blocked}>
          {t("documents.loadMore")}
        </button>
      )}
    </aside>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
