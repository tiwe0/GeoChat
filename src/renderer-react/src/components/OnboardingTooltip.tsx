import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { TooltipRenderProps } from "react-joyride";

type ButtonPropsWithChildren = { children?: ReactNode };

/** Joyride tooltip with a short step-to-step transition that matches the panel UI. */
export function OnboardingTooltip({ backProps, index, isLastStep, primaryProps, skipProps, step, tooltipProps }: TooltipRenderProps) {
  const primaryButton = primaryProps as typeof primaryProps & ButtonPropsWithChildren;
  const skipButton = skipProps as typeof skipProps & ButtonPropsWithChildren;
  const backButton = backProps as typeof backProps & ButtonPropsWithChildren;
  const { buttons, content, styles, title } = step;

  return (
    <motion.div
      key={`joyride-tooltip-${index}`}
      className="react-joyride__tooltip"
      data-joyride-step={index}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={styles.tooltip}
      {...tooltipProps}
      aria-labelledby={title ? "joyride-tooltip-title" : undefined}
      aria-describedby="joyride-tooltip-content"
      aria-label={title ? undefined : String(content)}
    >
      <div style={styles.tooltipContainer}>
        {title && <h4 id="joyride-tooltip-title" style={styles.tooltipTitle}>{title}</h4>}
        <div id="joyride-tooltip-content" style={styles.tooltipContent}>{content}</div>
      </div>
      {buttons.some((button) => button === "back" || button === "primary" || button === "skip") && (
        <div style={styles.tooltipFooter}>
          <div style={styles.tooltipFooterSpacer}>
            {buttons.includes("skip") && !isLastStep && <button type="button" style={styles.buttonSkip} {...skipProps}>{skipButton.children}</button>}
          </div>
          {buttons.includes("back") && index > 0 && <button type="button" style={styles.buttonBack} {...backProps}>{backButton.children}</button>}
          {buttons.includes("primary") && <button type="button" style={styles.buttonPrimary} {...primaryProps}>{primaryButton.children}</button>}
        </div>
      )}
    </motion.div>
  );
}
