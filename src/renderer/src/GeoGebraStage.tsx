import { For, Show } from "solid-js";
import type { HealthStatus } from "@geochat-ai/app";
import type { RendererI18n } from "./i18n";
import type { ViewMode } from "./workbench-types";

type GeoGebraLoadMessage = {
  status: string;
  label: string;
  detail: string;
};

export function GeoGebraStage(props: {
  containerId: string;
  setContainer: (element: HTMLDivElement) => void;
  isReady: boolean;
  isRunning: boolean;
  view: ViewMode;
  introVisible: boolean;
  introDissolving: boolean;
  loadError?: string | null;
  loadMessages: GeoGebraLoadMessage[];
  healthStatus?: HealthStatus["status"];
  modelProvider: string;
  modelId: string;
  selectedObjects: string[];
  copy: RendererI18n;
}) {
  return (
    <section class="geogebra-stage">
      <div id={props.containerId} ref={props.setContainer} class="geogebra-container" />
      <div class="stage-grid" aria-hidden="true" />
      <Show when={props.introVisible && props.view === "chat"}>
        <div classList={{ "stage-intent": true, dissolving: props.introDissolving }}>
          <span class="stage-intent-kicker">{props.copy.stage.kicker}</span>
          <strong>{props.copy.stage.title}</strong>
          <p>{props.copy.stage.body}</p>
        </div>
      </Show>
      <div classList={{ "stage-status": true, ready: props.isReady, running: props.isRunning }} aria-live="polite">
        <span>{props.isRunning ? props.copy.stage.running : props.isReady ? props.copy.stage.ready : props.copy.stage.loading}</span>
        <b>{props.healthStatus === "ok" ? props.copy.stage.localServiceReady : `${props.modelProvider} / ${props.modelId}`}</b>
      </div>
      <div class="stage-selection" aria-live="polite">
        <span>{props.selectedObjects.length ? props.copy.stage.selectedElements : props.copy.stage.selectedElementsEmpty}</span>
        <Show when={props.selectedObjects.length}>
          <div class="stage-selection-chips">
            <For each={props.selectedObjects.slice(0, 6)}>
              {(name) => <code>{name}</code>}
            </For>
          </div>
        </Show>
      </div>
      <Show when={!props.isReady}>
        <div class="geogebra-loading">
          <div>
            <strong>{props.loadError ? props.copy.stage.loadFailed : props.copy.stage.loadingTitle}</strong>
            <p>{props.loadError ?? props.copy.stage.loadingBody}</p>
            <ul class="geogebra-diagnostics">
              <For each={props.loadMessages}>
                {(message) => (
                  <li class={message.status}>
                    <span>{message.label}</span>
                    <code>{message.detail}</code>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </div>
      </Show>
    </section>
  );
}
