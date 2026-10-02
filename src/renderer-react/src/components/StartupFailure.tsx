import { useState } from "react";
import { Alert, Button, CssBaseline, Paper, Stack, ThemeProvider, Typography } from "@mui/material";
import { installedDesktopApi } from "../../../shared/desktop/tauri-bridge";
import { copilotTheme, FLOATING_SURFACE_ELEVATION } from "../theme";

export function StartupFailure({ error }: { error: unknown }) {
  const [logError, setLogError] = useState<string | null>(null);
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : String(error || "Unknown startup failure");
  const api = installedDesktopApi();

  return (
    <ThemeProvider theme={copilotTheme}>
      <CssBaseline />
      <Stack sx={{ minHeight: "100vh", alignItems: "center", justifyContent: "center", p: 3, bgcolor: "background.default" }}>
        <Paper elevation={FLOATING_SURFACE_ELEVATION} sx={{ width: "min(560px, 100%)", p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5" component="h1">GeoChat 无法启动</Typography>
            <Typography color="text.secondary">
              原生配置或本地 SQLite 服务未能初始化。你的数据不会回退到 WebView 存储。
            </Typography>
            <Alert severity="error" sx={{ overflowWrap: "anywhere" }}>{message}</Alert>
            {logError ? <Alert severity="warning">{logError}</Alert> : null}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button variant="contained" onClick={() => window.location.reload()}>重试启动</Button>
              <Button
                variant="outlined"
                disabled={!api}
                onClick={() => {
                  setLogError(null);
                  void api?.openLogDirectory().catch((caught) => {
                    setLogError(caught instanceof Error ? caught.message : String(caught));
                  });
                }}
              >
                打开日志目录
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </ThemeProvider>
  );
}
