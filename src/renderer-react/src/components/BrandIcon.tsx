import { Box } from "@mui/material";
import { BRAND_ICON_DATA_URI } from "./generated/brandIconData";

type BrandIconProps = {
  size?: number;
  className?: string;
};

/**
 * Render the icon inline so page CSP/CORS and web-accessible-resource rules
 * cannot prevent the content-script UI from displaying it.
 */
export function BrandIcon({ size = 48, className }: BrandIconProps) {
  return (
    <Box
      component="img"
      src={BRAND_ICON_DATA_URI}
      alt="GeoGebra Copilot"
      draggable={false}
      className={className}
      sx={{
        width: size,
        height: size,
        display: "block",
        objectFit: "contain",
        flex: "0 0 auto",
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}
