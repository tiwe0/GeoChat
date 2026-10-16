import { createElement, type JSX } from "react";

import { BRAND_ICON_DATA_URI } from "../../../src/renderer-react/src/components/generated/brandIconData.ts";

export interface GeoChatProductIconProps {
  readonly size?: number;
  readonly className?: string;
}

/** Product artwork for Harness tab and guide surfaces. */
export function GeoChatProductIcon({ size = 24, className }: GeoChatProductIconProps): JSX.Element {
  return createElement("img", {
    "aria-hidden": true,
    alt: "",
    className,
    draggable: false,
    height: size,
    src: BRAND_ICON_DATA_URI,
    style: { display: "block", objectFit: "contain", pointerEvents: "none", userSelect: "none" },
    width: size
  });
}
