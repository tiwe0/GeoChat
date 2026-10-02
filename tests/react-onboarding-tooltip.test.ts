import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TooltipRenderProps } from "react-joyride";
import { OnboardingTooltip } from "../src/renderer-react/src/components/OnboardingTooltip";

describe("tutorial skip control", () => {
  test("renders a labeled skip button on the first, middle, and final step", () => {
    for (const index of [0, 4, 10]) {
      const props = {
        index,
        isLastStep: index === 10,
        backProps: { children: "Back" },
        primaryProps: { children: index === 10 ? "Done" : "Next" },
        skipProps: { children: "跳过教程", "aria-label": "跳过教程", "data-action": "skip", onClick: () => {} },
        step: { buttons: ["back", "skip", "primary"], content: "Tutorial", title: "Control", styles: {} },
        tooltipProps: { role: "dialog" },
      } as unknown as TooltipRenderProps;
      const markup = renderToStaticMarkup(createElement(OnboardingTooltip, props));
      expect(markup).toContain('data-action="skip"');
      expect(markup).toContain('aria-label="跳过教程"');
      expect(markup).toContain("跳过教程</button>");
      expect(markup).toContain(index === 10 ? "Done</button>" : "Next</button>");
    }
  });
});
