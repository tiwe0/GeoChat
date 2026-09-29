import type {
  GeoGebraSelectionContext,
  GeoGebraSelectionRefreshReason,
} from "../geogebra/selection-context";
import { AssistantWorkspace } from "../features/assistant-workspace/AssistantWorkspace";

export type AssistantPanelProps = {
  canvasReady?: boolean;
  selectionContext?: GeoGebraSelectionContext;
  onRefreshSelection?: (reason: GeoGebraSelectionRefreshReason) => GeoGebraSelectionContext | undefined;
  onConversationStarted?: () => void;
};

export function AssistantPanel(props: AssistantPanelProps) {
  return <AssistantWorkspace {...props} />;
}
