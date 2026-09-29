import type { ComponentProps } from "react";
import { FusionModeSurface, InteractionModeTransition } from "../fusion-mode";
import { FusionAssistantOverlays } from "./FusionAssistantOverlays";

type AssistantFusionSurfaceProps = {
  transition: ComponentProps<typeof InteractionModeTransition>["transition"];
  surface: ComponentProps<typeof FusionModeSurface>;
  overlays: ComponentProps<typeof FusionAssistantOverlays>;
};

export function AssistantFusionSurface(props: AssistantFusionSurfaceProps) {
  return (
    <>
      <InteractionModeTransition transition={props.transition} />
      <FusionModeSurface {...props.surface} />
      <FusionAssistantOverlays {...props.overlays} />
    </>
  );
}
