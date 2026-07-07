# Advanced Drawing Command Semantics

Advanced drawing commands are skill-gated GeoGebra construction macros. They are not JavaScript functions and they are not nested macro systems.

## Macro Quality Contract

Every advanced drawing command must behave like a small mathematical construction compiler, not like a prompt shortcut.

Each command definition must declare:

- `assumptions`: the mathematical domain where the macro is valid.
- `parameters`: accepted argument names, kinds, and constraints.
- `invariants`: mathematical facts the emitted construction is intended to satisfy.
- `expectedObjects`: labels that should exist after GeoGebra execution.
- `readbackHints`: what the agent must verify from canvas context before styling or explaining follow-up details.

A macro should reject inputs outside its mathematical domain instead of drawing a plausible but false diagram. For example, a tetrahedron circumsphere macro must reject four coplanar points; it must not silently reuse a default sphere center.

Defaults are used only when a parameter is omitted. If a caller explicitly supplies a malformed label, unsupported key, invalid coordinate tuple, out-of-range number, degenerate geometry, or invalid expression wrapper, the macro must reject the call during compilation. Silent per-field fallback is not allowed because it can produce a diagram whose objects no longer correspond to the caller's stated mathematical data.

When a macro supports custom geometric data, derived objects must be recomputed from that data:

- A tetrahedron circumsphere center is solved from the four actual vertices.
- A tetrahedron incenter is computed from opposite-face area weights.
- A pyramid height foot is computed from the current base vertices, not a stale default origin.

Defaults are allowed only as textbook examples. Once the caller passes explicit data, the macro must either recompute all dependent quantities or reject the input.

Unlocked command packets shown to the main agent must include at least the command description, accepted parameter names/kinds, assumptions, and invariants. A command name alone is not enough context for mathematically safe use.

## Evaluation Boundary

The command pipeline is:

```text
JSON args
  -> backend macro compiler validates and normalizes args
  -> backend emits GeoGebra commands
  -> GeoGebra executes commands and evaluates GeoGebra expressions
```

The backend never evaluates GeoGebra symbols such as `theta`, `A`, `f`, or `x(P)`. It only compiles strings after validation.

## Argument Kinds

| Kind | Example | Meaning | Evaluation |
| --- | --- | --- | --- |
| number literal | `{ "a": -2 }` | Backend compile-time numeric value. | Evaluated once by backend formatting. |
| identifier/name field | `{ "centerName": "O" }` | GeoGebra object name to create or use in emitted commands. | Symbolic name, not looked up by backend. |
| object reference | `{ "kind": "object_ref", "name": "theta" }` | Existing GeoGebra object reference. | GeoGebra execution-time symbol. Requires the macro to know how to use it. |
| dynamic expression | `{ "kind": "ggb_expr", "expr": "theta", "evaluation": "dynamic" }` | GeoGebra expression that should preserve dependencies. | Evaluated by GeoGebra and remains dependent when GeoGebra supports it. |
| snapshot expression | `{ "kind": "ggb_expr", "expr": "theta", "evaluation": "snapshot" }` | GeoGebra expression that should be copied as a free object at command execution time. | Compiles through `CopyFreeObject(theta)` where the macro supports expression args. |

Plain strings are not expressions. A plain string field is either a fixed enum-like option or an identifier/name field documented by that macro. Expression strings must use the tagged `ggb_expr` form.

## Dynamic Versus Snapshot

For a unit-circle macro:

```json
{
  "name": "drawUnitCircleTrigProjection",
  "args": {
    "angleName": "theta0",
    "angleDegrees": {
      "kind": "ggb_expr",
      "expr": "theta",
      "evaluation": "dynamic"
    }
  }
}
```

The macro emits `theta0 = theta`, then constructs `P` from `theta0`. If `theta` changes and GeoGebra preserves dependency, the diagram follows.

With:

```json
{
  "kind": "ggb_expr",
  "expr": "theta",
  "evaluation": "snapshot"
}
```

the macro emits `theta0 = CopyFreeObject(theta)`. This asks GeoGebra to copy the value at command execution time, so downstream objects depend on `theta0`, not the original `theta`.

## No Macro Nesting

Advanced drawing commands must not call or embed other advanced drawing commands in their `args`.

Rejected shape:

```json
{
  "name": "drawQuadraticVertexDiagram",
  "args": {
    "helper": {
      "kind": "advanced_command",
      "name": "drawUnitCircleTrigProjection"
    }
  }
}
```

Composition should happen one level above the macro layer: the skill selector or main agent may choose multiple unlocked commands in separate tool calls, but one macro cannot expand into another macro. This keeps permissions, validation, and canvas readback boundaries clear.
