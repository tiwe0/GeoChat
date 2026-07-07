import { ShieldCheck } from "lucide-solid";
import type { RendererI18n } from "../i18n";
import { SectionCard, SwitchField } from "../workbench-ui";
import type { RendererImprovementPlanState } from "../workbench-types";

export function ConfigImprovementPlanSection(props: {
  copy: RendererI18n;
  state: RendererImprovementPlanState;
  busy: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <SectionCard class="config-module-card about-secondary-card">
      <div class="mcp-setting">
        <div class="mcp-setting-main">
          <strong><ShieldCheck size={16} />{props.copy.config.improvementPlanTitle}</strong>
          <p>{props.copy.config.improvementPlanBody}</p>
        </div>
        <SwitchField
          checked={props.state.enabled}
          disabled={!props.state.available || props.busy}
          label={props.copy.config.improvementPlanTitle}
          onLabel={props.copy.config.improvementPlanOn}
          offLabel={props.copy.config.improvementPlanOff}
          onChange={props.onEnabledChange}
        />
      </div>
    </SectionCard>
  );
}
