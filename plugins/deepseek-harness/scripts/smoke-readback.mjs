// Explicit integration check; Playwright is supplied by the development environment,
// not shipped as a plugin dependency. Never connects to the user's running Harness.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(packageRoot, "dist", "geogebra");
const evidence = await mkdtemp(join(tmpdir(), "geochat-readback-"));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const html = `<!doctype html><html><body style="margin:0"><div id="stage" style="width:900px;height:620px"></div>
<script src="/geogebra/geochat-runtime.js"></script><script>
window.runtime = GeoChatCanvasRuntime.createCanvasRuntime({assetBaseUrl:location.origin+'/geogebra'});
runtime.attach(document.getElementById('stage'));
</script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(html);
      return;
    }
    const file = resolve(assets, `.${decodeURIComponent(path.replace(/^\/geogebra/, ""))}`);
    if (!file.startsWith(assets + sep)) throw new Error("Invalid asset path");
    const mime = file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : "application/octet-stream";
    const body = await readFile(file);
    response.writeHead(200, { "content-type": mime });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (
      route
        .request()
        .url()
        .startsWith(origin + "/")
    )
      return route.continue();
    external.push(new URL(route.request().url()).origin);
    return route.abort();
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.runtime?.getSnapshot().phase === "ready", undefined, { timeout: 30000 });
  const results = await page.evaluate(async () => {
    const run = (tool, args = {}) => window.runtime.run(tool, args);
    const draw = await run("executeGeoGebraCommands", {
      commands: [
        'A = Text("Alpha label", (0, 0))',
        'B = Text("Beta label", (0.2, 0))',
        'C = Text("Outside label", (100, 100))',
        "t = 0",
        "P = (t, 0)",
        'labels = {Text("List one", (1, 2)), Text("List two", (1.1, 2))}'
      ]
    });
    const before = await run("sceneReport");
    const layout = await run("checkLayout", { objects: ["A", "B", "C"] });
    const listLayout = await run("checkLayout", { objects: ["labels"] });
    const style = await run("setTextStyle", { objects: ["A"], fontSize: 10 });
    const afterStyle = await run("sceneReport", { objects: ["A"], include: ["style"] });
    const afterLayout = await run("checkLayout", { objects: ["A"] });
    const after = await run("sceneReport", { include: ["viewport"] });
    const animation = await run("configureGeoGebraAnimation", {
      object: "t",
      from: 0,
      to: 10,
      durationMs: 2000,
      mode: "continuous"
    });
    const frames = await run("captureFrames", { count: 3, intervalMs: 100, transparent: false });
    const moving = await run("sceneReport", { include: ["viewport"] });
    await run("controlGeoGebraAnimation", { action: "pause", objects: ["t"] });
    // Keep image payloads outside the JSON evidence file.
    const images = frames.frames.map((frame) => frame.base64);
    return {
      draw,
      before,
      layout,
      listLayout,
      style,
      afterStyle,
      afterLayout,
      after,
      animation,
      moving,
      frames: { ...frames, frames: frames.frames.map(({ base64, ...frame }) => ({ ...frame, bytes: base64.length })) },
      images
    };
  });
  await writeFile(join(evidence, "raw-report.json"), JSON.stringify({ ...results, images: undefined }, null, 2));
  for (const key of [
    "draw",
    "before",
    "layout",
    "listLayout",
    "style",
    "afterStyle",
    "afterLayout",
    "after",
    "animation",
    "moving",
    "frames"
  ]) {
    assert.equal(results[key].ok, true, key);
  }
  assert.equal(results.before.viewport.status, "available");
  assert.equal(results.layout.status, "issues_found");
  assert(
    results.layout.labelCollisions.some((pair) => [pair.a, pair.b].includes("A") && [pair.a, pair.b].includes("B")),
    "overlapping text containers"
  );
  assert(
    results.layout.outsideViewport.some((item) => item.object === "C"),
    "outside text"
  );
  assert.equal(results.listLayout.boxes.length, 2, "list text bounds");
  assert(results.listLayout.labelCollisions.length > 0, "list text overlap");
  assert.deepEqual(
    results.before.objects.map((o) => o.name),
    results.after.objects.map((o) => o.name),
    "no leaked probes"
  );
  const width = (box) => box.bboxPx.maxX - box.bboxPx.minX;
  assert(
    width(results.afterLayout.boxes[0]) < width(results.layout.boxes.find((box) => box.id === "A")),
    "smaller text produces smaller real box"
  );
  assert(results.moving.businessAnimations.some((item) => item.object === "t" && item.currentValue > 0));
  assert.equal(new Set(results.images).size, 3, "frames show real changing pixels");
  for (const [index, data] of results.images.entries())
    await writeFile(join(evidence, `frame-${index}.png`), Buffer.from(data, "base64"));
  delete results.images;
  await page.screenshot({ path: join(evidence, "canvas.png") });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(join(evidence, "report.json"), JSON.stringify({ passed: true, results, errors, external }, null, 2));
  console.log(
    JSON.stringify({
      passed: true,
      evidence,
      realTextBoxes: results.layout.boxes.length,
      listTextBoxes: results.listLayout.boxes.length,
      frames: 3
    })
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
