import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { useEffect, useState, type ReactNode } from "react";
import type { CanvasRuntime } from "./canvas-runtime.ts";
import { mountCanvasOpener } from "./canvas-opener.ts";
import { IsolatedCanvas } from "./isolated-canvas.tsx";
import { createNativeCanvasConnection, mountNativeCanvasRemote } from "./native-connection.ts";
import { GeoChatProductIcon } from "./product-icon.tsx";
import { connectSessionCanvas } from "./session-connection.ts";
import { NATIVE_CANVAS_NAMESPACE } from "../src/native-protocol.ts";

const CANVAS_TAB_ID = "dsh-geochat-plugin/canvas";
type CanvasClientContext = Pick<Context, "effect" | "inject" | "sidebarRight" | "sidebarRightTabs" | "remote"> & {
  readonly slots: Pick<SlotCore, "register"> & {
    inject(name: "sidebar.right.pane.tab", register: () => () => void): () => void;
  };
};
type CanvasTabProps = {
  readonly sessionId: SessionId;
  readonly remote: Context["remote"];
};

export const inject = ["slots", "sidebarRight", "sidebarRightTabs", "remote"];

function CanvasTab({ sessionId, remote }: CanvasTabProps): ReactNode {
  return <SessionCanvas key={sessionId} sessionId={sessionId} remote={remote} />;
}

function SessionCanvas({ sessionId, remote }: CanvasTabProps): ReactNode {
  const [runtime, setRuntime] = useState<CanvasRuntime | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  useEffect(() => {
    if (!runtime) return;
    const abort = new AbortController();
    setConnectionError(false);
    void runtime.ready
      .then(() => {
        if (abort.signal.aborted || runtime.getSnapshot().phase !== "ready") return;
        return connectSessionCanvas({
          signal: abort.signal,
          connect: () => createNativeCanvasConnection({ remote, sessionId, runtime, signal: abort.signal }),
          onDisconnected: () => setConnectionError(true)
        });
      })
      .catch(() => {
        if (!abort.signal.aborted) setConnectionError(true);
      });
    return () => {
      abort.abort();
    };
  }, [runtime, remote, sessionId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      <IsolatedCanvas assetBaseUrl="/geochat-assets/" onRuntimeChange={setRuntime} />
      {connectionError ? (
        <p
          role="alert"
          style={{
            position: "absolute",
            bottom: 0,
            margin: 0,
            padding: "0.75rem",
            background: "#fff",
            color: "#4b5563",
            font: "0.875rem/1.5 system-ui"
          }}
        >
          画布连接已断开。请检查已有构造后重新打开；若操作中断后仍无法连接，请重启 Harness。
        </p>
      ) : null}
    </div>
  );
}

export async function apply(ctx: CanvasClientContext): Promise<() => Promise<void>> {
  const unmount = await mountNativeCanvasRemote(ctx);
  ctx.inject(["slots", "sidebarRight", "sidebarRightTabs", "remote", `remote.${NATIVE_CANVAS_NAMESPACE}`], (scope) => {
    const canvasScope = scope as unknown as CanvasClientContext;
    canvasScope.effect(
      () =>
        canvasScope.sidebarRightTabs.register({
          id: CANVAS_TAB_ID,
          kind: "geochat-canvas",
          title: () => "GeoChat 画布",
          keepMounted: true,
          guide: [{ id: "canvas", order: 40, title: () => "GeoChat 画布", icon: GeoChatProductIcon }]
        }),
      "geochat-canvas.type"
    );
    canvasScope.effect(
      () =>
        canvasScope.slots.inject("sidebar.right.pane.tab", () =>
          canvasScope.slots.register(
            {
              name: "sidebar.right.pane.tab",
              key: CANVAS_TAB_ID,
              inject: () => ({ remote: canvasScope.remote })
            },
            CanvasTab
          )
        ),
      "geochat-canvas.body"
    );
    canvasScope.effect(
      () => mountCanvasOpener({ remote: canvasScope.remote, sidebarRight: canvasScope.sidebarRight }),
      "geochat-canvas.opener"
    );
  });
  return unmount;
}
