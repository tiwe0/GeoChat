import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { SettingsHint } from "./SettingsHint";

export function SettingsSection(props: { title: string; description: string; children: ReactNode }) {
  return (
    <Box component="section" className="settings-section">
      <Box className="settings-section-copy">
        <SettingsHint text={props.description}>
          <Typography component="span" variant="subtitle2" sx={{ fontWeight: 750 }}>{props.title}</Typography>
        </SettingsHint>
      </Box>
      <Stack className="settings-section-controls" spacing={1.25}>
        {props.children}
      </Stack>
    </Box>
  );
}
