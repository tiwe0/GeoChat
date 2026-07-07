import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const buildScript = isWindows ? "tauri:build:windows" : "tauri:build:macos";

const steps = [
  ["Typecheck", ["bun", "run", "typecheck"]],
  ["Test", ["bun", "test", "tests"]],
  ["Prepare Tauri app bundle", ["bun", "run", "tauri:prepare"]],
  ["Check Tauri Rust shell", ["bun", "run", "tauri:check"]],
  [`Build Tauri ${isWindows ? "Windows" : "macOS"} package`, ["bun", "run", buildScript]],
  [
    "Smoke Tauri packaged layout",
    ["bun", "run", "tauri:package:smoke", "--", "--json-out", "dist/tauri-package-evidence.local.json"]
  ],
  ["Smoke packaged backend runtime", ["bun", "run", "package:backend-smoke"]]
];

for (const [label, command] of steps) {
  console.log(`\n==> ${label}`);
  console.log(`$ ${command.join(" ")}`);
  await run(command);
}

console.log("\nTauri local acceptance ok.");

function run(command) {
  const [bin, ...args] = command;
  return new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, {
      stdio: "inherit",
      shell: isWindows
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`${command.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}
