import { createTheme } from "@mui/material/styles";

export const copilotTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2563eb",
      dark: "#1d4ed8",
      light: "#dbeafe",
    },
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
    text: {
      primary: "#172033",
      secondary: "#526079",
    },
    divider: "#dfe5ee",
    error: {
      main: "#b42318",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Nunito Sans Variable", "Noto Sans SC Variable", "Microsoft YaHei", system-ui, sans-serif',
    fontSize: 14,
    button: {
      letterSpacing: 0,
      textTransform: "none",
      fontWeight: 600,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: "background-color 160ms ease, color 160ms ease, transform 160ms ease",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        outlined: {
          borderColor: "#dfe5ee",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          minHeight: 36,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#93c5fd",
          },
          "&.Mui-focused": {
            backgroundColor: "#ffffff",
            boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        h4: { fontWeight: 800, letterSpacing: "-0.03em" },
        h5: { fontWeight: 800, letterSpacing: "-0.025em" },
        h6: { fontWeight: 750, letterSpacing: "-0.015em" },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          alignItems: "center",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          border: "1px solid #dfe5ee",
          boxShadow: "0 18px 48px rgba(23, 32, 51, 0.18)",
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontWeight: 800,
          letterSpacing: "-0.015em",
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: "12px 20px 18px",
          gap: 4,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          marginTop: 4,
          border: "1px solid #dfe5ee",
          borderRadius: 10,
          boxShadow: "0 12px 30px rgba(23, 32, 51, 0.14)",
        },
      },
    },
  },
});
