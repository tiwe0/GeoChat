import { For } from "solid-js";
import { Sparkles } from "lucide-solid";
import {
  BUILTIN_AGENT_SKILL_NAMES,
  DEFAULT_SKILL_CONFIG,
  VISUAL_PROFILE_NAMES
} from "../desktop-config";
import { interpolate, type RendererI18n } from "../i18n";
import { SectionCard, SwitchField } from "../workbench-ui";
import type { VisualProfileName } from "../workbench-types";

type BuiltinAgentSkillName = (typeof BUILTIN_AGENT_SKILL_NAMES)[number];

const BUILTIN_SKILL_CATALOG: Array<{ name: BuiltinAgentSkillName }> = BUILTIN_AGENT_SKILL_NAMES.map((name) => ({ name }));
const VISUAL_PROFILE_CATALOG: Array<{ name: VisualProfileName }> = VISUAL_PROFILE_NAMES.map((name) => ({ name }));
const SKILL_GROUPS: Array<{
  key: keyof RendererI18n["config"]["skillGroups"];
  skills: BuiltinAgentSkillName[];
}> = [
  {
    key: "algebra",
    skills: [
      "number-expression",
      "factorization-formulas",
      "equations-inequalities",
      "quadratic-equation",
      "inequality-interval",
      "sequence",
      "vector"
    ]
  },
  {
    key: "functions",
    skills: [
      "function-graph",
      "quadratic-function",
      "polynomial-function",
      "exponential-logarithmic-function",
      "exponential-log-transform",
      "trigonometric-function",
      "trigonometric-unit-circle",
      "derivative-application",
      "derivative-tangent"
    ]
  },
  {
    key: "geometry",
    skills: [
      "plane-geometry",
      "triangle-circle-geometry",
      "geometric-transformations",
      "geometric-construction",
      "solid-geometry",
      "solid-section",
      "prism",
      "sphere",
      "pyramid-circumsphere",
      "analytic-geometry-conic",
      "conic-focus-directrix"
    ]
  },
  {
    key: "dataApplication",
    skills: ["linear-programming", "linear-programming-feasible-region", "probability-statistics", "classical-probability", "statistical-distribution"]
  },
  {
    key: "presentation",
    skills: ["visual-post-processing", "camera-framing", "viewport-scale-composition"]
  }
];

export function ConfigSkillsSection(props: {
  copy: RendererI18n;
  skillsEnabled: boolean;
  skillAutoActivate: boolean;
  visualProfile: VisualProfileName;
  enabledSkillNameSet: Set<string>;
  enabledBuiltinSkillCount: number;
  enabledSkillCountFor: (skills: readonly BuiltinAgentSkillName[]) => number;
  onSkillsEnabledChange: (enabled: boolean) => void;
  onSkillAutoActivateChange: (enabled: boolean) => void;
  onVisualProfileChange: (profile: VisualProfileName) => void;
  onSkillEnabledChange: (name: string, enabled: boolean) => void;
  onResetBuiltinSkills: () => void;
}) {
  return (
    <SectionCard class="config-module-card config-card-wide skill-config-card">
      <div class="mcp-setting">
        <div class="mcp-setting-main">
          <strong><Sparkles size={16} />{props.copy.config.skillConfigTitle}</strong>
          <p>{props.copy.config.skillConfigBody}</p>
        </div>
        <span class={`status-pill ${props.skillsEnabled ? "active" : "disabled"}`}>
          {props.skillsEnabled ? props.copy.config.skillConfigEnabled : props.copy.config.skillConfigDisabled}
        </span>
      </div>
      <div class="skill-policy-grid">
        <div class="skill-student-note">
          <strong>{props.copy.config.skillCurriculumCoverageTitle}</strong>
          <p>{props.copy.config.skillCurriculumCoverageBody}</p>
        </div>
        <div class="skill-policy-card">
          <div>
            <strong>{props.copy.config.skillSystemTitle}</strong>
            <p>{props.copy.config.skillSystemBody}</p>
          </div>
          <SwitchField
            checked={props.skillsEnabled}
            label={props.copy.config.skillSystemTitle}
            onLabel={props.copy.config.skillConfigEnabled}
            offLabel={props.copy.config.skillConfigDisabled}
            onChange={props.onSkillsEnabledChange}
          />
        </div>
        <div class="skill-policy-card">
          <div>
            <strong>{props.copy.config.skillAutoActivateTitle}</strong>
            <p>{props.copy.config.skillAutoActivateBody}</p>
          </div>
          <SwitchField
            checked={props.skillAutoActivate}
            disabled={!props.skillsEnabled}
            label={props.copy.config.skillAutoActivateTitle}
            onLabel={props.copy.config.skillAutoActivateOn}
            offLabel={props.copy.config.skillAutoActivateOff}
            onChange={props.onSkillAutoActivateChange}
          />
        </div>
        <div class="skill-policy-card skill-profile-card">
          <div>
            <strong>{props.copy.config.skillVisualProfileTitle}</strong>
            <p>{props.copy.config.skillVisualProfileBody}</p>
          </div>
          <div class="visual-profile-grid" role="radiogroup" aria-label={props.copy.config.skillVisualProfileTitle}>
            <For each={VISUAL_PROFILE_CATALOG}>
              {(profile) => {
                const profileCopy = () => props.copy.config.visualProfiles[profile.name];
                const selected = () => props.visualProfile === profile.name;
                return (
                  <button
                    type="button"
                    classList={{ "visual-profile-option": true, active: selected() }}
                    aria-pressed={selected()}
                    disabled={!props.skillsEnabled}
                    onClick={() => props.onVisualProfileChange(profile.name)}
                  >
                    <strong>{profileCopy().title}</strong>
                    <span>{profileCopy().body}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </div>
      <div class="skill-catalog-heading">
        <div>
          <strong>{props.copy.config.skillBuiltinTitle}</strong>
          <p>{interpolate(props.copy.config.skillBuiltinBody, {
            enabled: props.enabledBuiltinSkillCount,
            total: BUILTIN_SKILL_CATALOG.length
          })}</p>
        </div>
        <button type="button" class="text-button" disabled={!props.skillsEnabled} onClick={props.onResetBuiltinSkills}>
          {props.copy.config.skillEnableAll}
        </button>
      </div>
      <For each={SKILL_GROUPS}>
        {(group) => {
          const groupCopy = () => props.copy.config.skillGroups[group.key];
          return (
            <section class="skill-group">
              <div class="skill-group-heading">
                <div>
                  <strong>{groupCopy().title}</strong>
                  <p>{groupCopy().body}</p>
                </div>
                <span>
                  {interpolate(props.copy.config.skillGroupCount, {
                    enabled: props.enabledSkillCountFor(group.skills),
                    total: group.skills.length
                  })}
                </span>
              </div>
              <div class="skill-catalog-grid">
                <For each={group.skills}>
                  {(skillName) => {
                    const skillCopy = () => props.copy.config.skillCatalog[skillName];
                    const isEnabled = () => props.enabledSkillNameSet.has(skillName);
                    return (
                      <article classList={{ "skill-catalog-item": true, enabled: props.skillsEnabled && isEnabled(), disabled: !props.skillsEnabled }}>
                        <div class="skill-catalog-item-head">
                          <div>
                            <strong>{skillCopy().title}</strong>
                            <code>{skillName}</code>
                          </div>
                          <SwitchField
                            checked={isEnabled()}
                            disabled={!props.skillsEnabled}
                            label={skillCopy().title}
                            onLabel={props.copy.config.skillItemOn}
                            offLabel={props.copy.config.skillItemOff}
                            onChange={(value) => props.onSkillEnabledChange(skillName, value)}
                          />
                        </div>
                        <p>{skillCopy().body}</p>
                        <div class="skill-tag-row">
                          <For each={skillCopy().tags}>
                            {(tag) => <span>{tag}</span>}
                          </For>
                        </div>
                      </article>
                    );
                  }}
                </For>
              </div>
            </section>
          );
        }}
      </For>
    </SectionCard>
  );
}

export { DEFAULT_SKILL_CONFIG };
