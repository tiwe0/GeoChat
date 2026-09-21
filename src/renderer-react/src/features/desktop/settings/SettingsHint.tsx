import type { ReactNode } from "react";
import { Box, Tooltip } from "@mui/material";

export function SettingsHint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip
      title={text}
      arrow
      placement="top-start"
      enterDelay={450}
      enterNextDelay={150}
      describeChild
    >
      <Box component="span" className="settings-hint-target" tabIndex={0}>
        {children}
      </Box>
    </Tooltip>
  );
}
