import type { RendererI18n } from "../i18n";
import type {
  RendererAppBundleUpdateState,
  RendererImprovementPlanState,
  RendererUnifiedUpdateState,
  RendererUpdateState
} from "../workbench-types";
import { ConfigAboutSection } from "./ConfigAboutSection";
import { ConfigImprovementPlanSection } from "./ConfigImprovementPlanSection";
import { ConfigUpdatesSection } from "./ConfigUpdatesSection";

export function ConfigAboutTab(props: {
  copy: RendererI18n;
  wechatCopied: boolean;
  updateState: RendererUpdateState;
  unifiedUpdateState: RendererUnifiedUpdateState;
  appBundleUpdateState: RendererAppBundleUpdateState;
  updateStatusBody: string;
  primaryUpdateActionBusy: boolean;
  primaryUpdateActionLabel: string;
  improvementPlanState: RendererImprovementPlanState;
  improvementPlanBusy: boolean;
  onCopyWechat: () => void;
  onPrimaryUpdateAction: () => void;
  onImprovementPlanEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <>
      <ConfigAboutSection copy={props.copy} wechatCopied={props.wechatCopied} onCopyWechat={props.onCopyWechat} />
      <ConfigUpdatesSection
        copy={props.copy}
        updateState={props.updateState}
        unifiedUpdateState={props.unifiedUpdateState}
        appBundleUpdateState={props.appBundleUpdateState}
        statusBody={props.updateStatusBody}
        primaryActionBusy={props.primaryUpdateActionBusy}
        primaryActionLabel={props.primaryUpdateActionLabel}
        onPrimaryAction={props.onPrimaryUpdateAction}
      />
      <ConfigImprovementPlanSection
        copy={props.copy}
        state={props.improvementPlanState}
        busy={props.improvementPlanBusy}
        onEnabledChange={props.onImprovementPlanEnabledChange}
      />
    </>
  );
}
