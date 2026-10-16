import assert from "node:assert/strict";
import test from "node:test";
import { NativeCanvasBroker } from "../src/native-broker.ts";
import { CanvasOpener } from "../src/canvas-opener.ts";

function setup(timeoutMs = 300) {
  const canvas = new NativeCanvasBroker();
  const opener = new CanvasOpener(canvas, timeoutMs);
  return {
    canvas,
    opener,
    dispose: () => {
      opener.dispose();
      canvas.dispose();
    }
  };
}

test("open requires the current session's UI and refuses ambiguous windows", async () => {
  const { opener, dispose } = setup();
  try {
    await assert.rejects(opener.open("a"), /not displayed/);
    const a = opener.register("a", "page-a");
    const first = opener.requests.attach(a.id);
    first.setReady();
    await assert.rejects(opener.open("b"), /not displayed/);
    const second = opener.register("a", "page-b");
    await assert.rejects(opener.open("a"), /multiple windows/);
    second.dispose();
    a.dispose();
  } finally {
    dispose();
  }
});

test("open waits for the real Applet and repeated opens preserve the canvas lease", async () => {
  const { canvas, opener, dispose } = setup();
  try {
    const ui = opener.register("a", "page-a");
    const controls = opener.requests.attach(ui.id);
    controls.setReady();
    const pending = opener.open("a");
    const command = (await controls.next()).value;
    assert.equal(command?.type, "execute");
    assert.equal(command?.toolName, "openCanvas");
    controls.reply({ id: command.id, ok: true, result: { opened: true } });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(settled, false);
    const applet = canvas.attach("a");
    opener.registerCanvas("a", "page-a");
    applet.setReady();
    assert.equal((await pending).ready, true);
    const again = opener.open("a");
    const next = (await controls.next()).value;
    controls.reply({ id: next.id, ok: true, result: { opened: true } });
    assert.equal((await again).opened, true);
    assert.equal(canvas.status("a").ready, true);
    applet.closeSettled();
    ui.dispose();
  } finally {
    dispose();
  }
});

test("open cancels before dispatch, times out loading and rejects a switched session", async () => {
  const { opener, dispose } = setup(60);
  try {
    const ui = opener.register("a", "page-a");
    const controls = opener.requests.attach(ui.id);
    controls.setReady();
    await assert.rejects(opener.open("a", AbortSignal.abort()), /abort/i);
    const loading = opener.open("a");
    const command = (await controls.next()).value;
    controls.reply({ id: command.id, ok: true, result: { opened: true } });
    await assert.rejects(loading, /not ready before.*deadline/);
    const switched = opener.open("a");
    const next = (await controls.next()).value;
    controls.reply({ id: next.id, ok: true, result: { opened: true } });
    ui.dispose();
    await assert.rejects(switched, /session changed|disconnected|not displayed/);
  } finally {
    dispose();
  }
});

test("open never claims success for an invalid UI acknowledgement or disposal", async () => {
  const { opener, dispose } = setup();
  try {
    const ui = opener.register("a", "page-a");
    const controls = opener.requests.attach(ui.id);
    controls.setReady();
    const pending = opener.open("a");
    const command = (await controls.next()).value;
    controls.reply({ id: command.id, ok: true, result: {} });
    await assert.rejects(pending, /did not confirm/);
    opener.dispose();
    await assert.rejects(opener.open("a"), /disposed/);
  } finally {
    dispose();
  }
});

test("open refuses a hidden canvas retained by another window", async () => {
  const { canvas, opener, dispose } = setup();
  try {
    const applet = canvas.attach("a");
    const release = opener.registerCanvas("a", "page-old");
    applet.setReady();
    const ui = opener.register("a", "page-new");
    const controls = opener.requests.attach(ui.id);
    controls.setReady();
    await assert.rejects(opener.open("a"), /belongs to another window/);
    assert.equal(opener.requests.status(ui.id).busy, false);
    release();
    applet.closeSettled();
    ui.dispose();
  } finally {
    dispose();
  }
});
