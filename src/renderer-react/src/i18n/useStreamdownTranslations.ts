import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { StreamdownTranslations } from "streamdown";

export function useStreamdownTranslations(): StreamdownTranslations {
  const { t } = useTranslation();

  return useMemo(() => ({
    close: t("streamdown.close"),
    copied: t("streamdown.copied"),
    copyCode: t("streamdown.copyCode"),
    copyLink: t("streamdown.copyLink"),
    copyTable: t("streamdown.copyTable"),
    copyTableAsCsv: t("streamdown.copyTableAsCsv"),
    copyTableAsMarkdown: t("streamdown.copyTableAsMarkdown"),
    copyTableAsTsv: t("streamdown.copyTableAsTsv"),
    downloadDiagram: t("streamdown.downloadDiagram"),
    downloadDiagramAsMmd: t("streamdown.downloadDiagramAsMmd"),
    downloadDiagramAsPng: t("streamdown.downloadDiagramAsPng"),
    downloadDiagramAsSvg: t("streamdown.downloadDiagramAsSvg"),
    downloadFile: t("streamdown.downloadFile"),
    downloadImage: t("streamdown.downloadImage"),
    downloadTable: t("streamdown.downloadTable"),
    downloadTableAsCsv: t("streamdown.downloadTableAsCsv"),
    downloadTableAsMarkdown: t("streamdown.downloadTableAsMarkdown"),
    exitFullscreen: t("streamdown.exitFullscreen"),
    externalLinkWarning: t("streamdown.externalLinkWarning"),
    imageNotAvailable: t("streamdown.imageNotAvailable"),
    mermaidFormatMmd: t("streamdown.mermaidFormatMmd"),
    mermaidFormatPng: t("streamdown.mermaidFormatPng"),
    mermaidFormatSvg: t("streamdown.mermaidFormatSvg"),
    openExternalLink: t("streamdown.openExternalLink"),
    openLink: t("streamdown.openLink"),
    resetView: t("streamdown.resetView"),
    tableFormatCsv: t("streamdown.tableFormatCsv"),
    tableFormatMarkdown: t("streamdown.tableFormatMarkdown"),
    tableFormatTsv: t("streamdown.tableFormatTsv"),
    viewFullscreen: t("streamdown.viewFullscreen"),
    zoomIn: t("streamdown.zoomIn"),
    zoomOut: t("streamdown.zoomOut"),
  }), [t]);
}
