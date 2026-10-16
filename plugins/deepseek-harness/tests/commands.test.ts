import assert from "node:assert/strict";
import { test } from "node:test";
import { GEOGEBRA_COMMAND_REFERENCE } from "../../../packages/app/src/geogebra-command-reference.js";
import { searchCanvasCommands, validateCanvasCommands } from "../src/commands.ts";

const risky = GEOGEBRA_COMMAND_REFERENCE.filter((entry) => entry.tags.some((tag) => tag === "risk:script-execution"));

test("rejects every catalogued script-execution call, localized aliases and nested forms", () => {
  assert.ok(risky.length >= 4);
  for (const entry of risky) {
    for (const name of [entry.command, entry.command.toLowerCase(), entry.command.toUpperCase(), entry.localizedName]) {
      if (!name) continue;
      for (const command of [`${name}(A)`, `${name} [ A ]`, `If(true, ${name}\n (A), 0)`]) {
        assert.throws(
          () => validateCanvasCommands([command]),
          /rejects commands tagged risk:script-execution/,
          command
        );
      }
    }
  }
});

test("preserves native expressions and quoted labels but fails closed on broken quoting", () => {
  validateCanvasCommands([
    "f(x)=If(x<0,-x,x)",
    "L=Sequence((n,n^2),n,1,10)",
    'Text("Execute(A) and 运行更新脚本[A]",(0,0))',
    'Text("escaped quote: \\" RunClickScript[A]",(0,0))'
  ]);
  assert.throws(() => validateCanvasCommands(['Text("unclosed']), /unterminated quoted string/);
  assert.throws(() => validateCanvasCommands(['Text("safe",(0,0)) + RunUpdateScript(A)']), /script-execution/);
});

test("search never advertises script-execution records", () => {
  for (const entry of risky) {
    for (const query of [entry.command, entry.localizedName ?? entry.command]) {
      const results = searchCanvasCommands(query, 12);
      assert.ok(results.every((result) => !result.tags.some((tag) => tag === "risk:script-execution")));
    }
  }
  assert.ok(searchCanvasCommands("圆", 2).length > 0);
  assert.ok(searchCanvasCommands("圆", 2).length <= 2);
});
