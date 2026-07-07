import { DownloadCloud, RefreshCw } from "lucide-solid";
import type { RendererI18n } from "../i18n";
import { SectionCard } from "../workbench-ui";
import type { RendererAppBundleUpdateState, RendererUnifiedUpdateState, RendererUpdateState } from "../workbench-types";

export function ConfigUpdatesSection(props: {
  copy: RendererI18n;
  updateState: RendererUpdateState;
  unifiedUpdateState: RendererUnifiedUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
  statusBody: string;
  primaryActionBusy: boolean;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
}) {
  return (
    <SectionCard class="config-module-card about-secondary-card about-update-card">
      <div class="about-card-heading">
        <div class="mcp-setting-main">
          <strong><RefreshCw size={16} />{props.copy.config.updateRecommendationTitle}</strong>
        </div>
        <span class={`status-pill ${props.unifiedUpdateState.status}`}>
          {props.copy.config.updateRecommendationStatuses[props.unifiedUpdateState.recommendation]}
        </span>
        <p>{props.statusBody}</p>
      </div>
      <div class="about-update-row">
        <div>
          <span>{props.copy.config.updateCurrentVersion}</span>
          <strong>{props.updateState.currentVersion}</strong>
        </div>
        <div>
          <span>{props.copy.config.updateAvailability}</span>
          <strong>{props.copy.config.updateRecommendationStatuses[props.unifiedUpdateState.recommendation]}</strong>
        </div>
        <div>
          <span>{props.copy.config.appBundleUpdateTitle}</span>
          <strong>
            {!props.appBundleUpdateState.configured
              ? props.copy.config.appBundleUpdateUnavailable
              : !props.appBundleUpdateState.updateAvailable
                ? props.copy.config.appBundleUpdateStatuses[props.appBundleUpdateState.status]
                : props.appBundleUpdateState.bundleVersion ?? props.copy.config.appBundleUpdateStatuses.available}
          </strong>
        </div>
        <button class="app-button" type="button" disabled={props.primaryActionBusy} onClick={props.onPrimaryAction}>
          <DownloadCloud size={16} />{props.primaryActionLabel}
        </button>
      </div>
    </SectionCard>
  );
}
