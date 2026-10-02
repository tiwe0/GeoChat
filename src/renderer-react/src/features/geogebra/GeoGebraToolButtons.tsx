import {
  CircleDotIcon,
  CircleIcon,
  HexagonIcon,
  MousePointer2Icon,
  PenToolIcon,
  RulerIcon,
  RotateCwIcon,
  SplineIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Alert,
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Portal,
  Stack,
  Tooltip,
} from "@mui/material";
import { useReducedMotion } from "motion/react";
import { useRef, useState, type MouseEvent, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import { FLOATING_SURFACE_ELEVATION } from "../../theme";
import {
  GEOGEBRA_TOOL_GROUPS,
  localizeGeoGebraLabel,
  type GeoGebraToolGroup,
  type GeoGebraToolGroupIcon,
} from "./toolCatalog";
import { useGeoGebraCanvasControls } from "./useGeoGebraCanvasControls";

const GROUP_ICONS: Readonly<Record<GeoGebraToolGroupIcon, LucideIcon>> = {
  movement: MousePointer2Icon,
  points: CircleDotIcon,
  lines: SplineIcon,
  circles: CircleIcon,
  polygons: HexagonIcon,
  measure: RulerIcon,
  transform: RotateCwIcon,
  objects: PenToolIcon,
};

export function GeoGebraToolButtons({ disabled = false }: { disabled?: boolean }) {
  const { t, i18n } = useTranslation();
  const { controls, snapshot } = useGeoGebraCanvasControls();
  const reduceMotion = useReducedMotion();
  const [menuState, setMenuState] = useState<{ anchor: HTMLButtonElement; group: GeoGebraToolGroup } | null>(null);
  const [pendingMode, setPendingMode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const controlsDisabled = disabled
    || pendingMode !== null
    || !controls
    || !snapshot.ready
    || snapshot.blocked
    || !snapshot.supportsToolModes;

  const openGroup = (event: MouseEvent<HTMLButtonElement>, group: GeoGebraToolGroup) => {
    setError(null);
    setMenuState({ anchor: event.currentTarget, group });
  };

  const selectMode = async (mode: number) => {
    if (!controls || controlsDisabled || pendingRef.current) return;
    pendingRef.current = true;
    setMenuState(null);
    setError(null);
    setPendingMode(mode);
    try {
      await controls.setToolMode(mode);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      pendingRef.current = false;
      setPendingMode(null);
    }
  };

  return (
    <>
      <Stack
        component="div"
        role="toolbar"
        aria-label={t("geogebra.tools")}
        aria-orientation="vertical"
        data-geogebra-tools="true"
        spacing={0.25}
        sx={{ alignItems: "center" }}
        onWheel={(event) => event.stopPropagation()}
      >
        {GEOGEBRA_TOOL_GROUPS.map((group) => {
          const GroupIcon = GROUP_ICONS[group.icon];
          const label = localizeGeoGebraLabel(group.label, language);
          const groupSelected = group.tools.some((entry) => entry.mode === snapshot.mode);
          const open = menuState?.group.id === group.id;
          return (
            <Tooltip key={group.id} title={label} placement="left" arrow>
              <span>
                <IconButton
                  type="button"
                  size="small"
                  color={groupSelected ? "primary" : "default"}
                  disabled={controlsDisabled}
                  aria-label={label}
                  aria-haspopup="menu"
                  aria-expanded={open ? "true" : undefined}
                  aria-pressed={groupSelected}
                  onClick={(event) => openGroup(event, group)}
                  sx={{ bgcolor: groupSelected ? "action.selected" : undefined }}
                >
                  <GroupIcon size={18} />
                </IconButton>
              </span>
            </Tooltip>
          );
        })}
      </Stack>

      <Menu
        open={Boolean(menuState)}
        anchorEl={menuState?.anchor ?? null}
        onClose={() => setMenuState(null)}
        transitionDuration={reduceMotion ? 0 : 180}
        anchorOrigin={{ vertical: "center", horizontal: "left" }}
        transformOrigin={{ vertical: "center", horizontal: "right" }}
        sx={{ zIndex: 1400 }}
        slotProps={{
          list: {
            "aria-label": menuState ? localizeGeoGebraLabel(menuState.group.label, language) : undefined,
            onWheel: (event: WheelEvent<HTMLElement>) => event.stopPropagation(),
            sx: { py: 0.5, maxHeight: "min(70dvh, 520px)", overflowY: "auto" },
          },
          paper: {
            elevation: FLOATING_SURFACE_ELEVATION,
            sx: {
              minWidth: 224,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "calc(100dvh - 24px)",
              borderRadius: 1.5,
              overscrollBehavior: "contain",
            },
          },
        }}
      >
        {menuState?.group.tools.map((entry) => {
          const selected = snapshot.mode === entry.mode;
          const label = localizeGeoGebraLabel(entry.label, language);
          const ItemIcon = GROUP_ICONS[menuState.group.icon];
          return (
            <Tooltip key={entry.mode} title={label} placement="left" arrow>
            <MenuItem
              selected={selected}
              disabled={controlsDisabled}
              aria-checked={selected}
              role="menuitemradio"
              onClick={() => void selectMode(entry.mode)}
              sx={{ minHeight: 36, px: 1.25, pointerEvents: "auto" }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}><ItemIcon size={17} /></ListItemIcon>
              <ListItemText primary={label} slotProps={{ primary: { variant: "body2" } }} />
            </MenuItem>
            </Tooltip>
          );
        })}
      </Menu>

      {error && (
        <Portal>
        <Box sx={{ position: "fixed", top: 54, right: 72, zIndex: 1400, pointerEvents: "auto" }}>
          <Alert severity="error" role="alert" onClose={() => setError(null)} sx={{ boxShadow: FLOATING_SURFACE_ELEVATION }}>
            {t("geogebra.toolError", { message: error })}
          </Alert>
        </Box>
        </Portal>
      )}
    </>
  );
}
