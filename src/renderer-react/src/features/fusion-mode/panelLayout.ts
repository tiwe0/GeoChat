import { FUSION_VIEWPORT_GUTTER, type FusionSafeInsets, type FusionSurfaceSize, type FusionViewport } from "./geometry";

const PANEL_WIDTH = 420;
const PANEL_RIGHT = 72;
const PANEL_COMPOSER_GAP = 16;
export const FUSION_TOOLBAR_HEIGHT_PROPERTY = "--fusion-toolbar-height";

/** Shared outer bounds for every right-side fusion panel, including the history drawer. */
export const FUSION_PANEL_FRAME_SX = {
  position: "fixed",
  top: `max(12px, calc((100dvh - var(${FUSION_TOOLBAR_HEIGHT_PROPERTY}, 0px)) / 2))`,
  right: PANEL_RIGHT,
  bottom: FUSION_VIEWPORT_GUTTER,
  left: "auto",
  width: `min(${PANEL_WIDTH}px, calc(100vw - ${PANEL_RIGHT + FUSION_VIEWPORT_GUTTER}px))`,
  zIndex: 1340,
} as const;

export function fusionPanelComposerInsets(viewport: FusionViewport, composer: FusionSurfaceSize): FusionSafeInsets {
  const right = PANEL_WIDTH + PANEL_RIGHT + PANEL_COMPOSER_GAP;
  // Narrow screens cannot fit both surfaces side by side; do not push the input off-canvas.
  return viewport.width >= right + composer.width + FUSION_VIEWPORT_GUTTER ? { right } : {};
}
