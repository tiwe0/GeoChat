# GeoGebra skill expansion research

This note records the sources and product decisions behind the ongoing skill-catalog expansion. It is intentionally separate from the runtime skill prompts so source metadata does not consume agent context on every run.

## Source hierarchy

1. The GeoGebra manual is the syntax and capability source of truth.
2. GeoGebra expert materials are used for construction strategy, interaction design, and failure modes.
3. Community examples are treated as patterns to verify, not as command specifications.

## Expert patterns retained

- **Construct, do not merely draw.** Dr. Jack L. Jackson II's drag-test activity and Malin Christersson's construction tutorial both distinguish a dependency-backed construction from a picture that only looks correct at one position. GeoChat therefore gets a dedicated `dynamic-construction-validation` skill that checks both under-constraint and over-constraint.
- **Use one meaningful driver where possible.** Tim Brzezinski's “One-Slider-Does-All” materials organize a demonstration around one master variable. GeoChat applies that pattern in `dynamic-parameter-exploration`, while keeping manual dragging and finite ranges.
- **Preserve the generating construction.** Expert locus activities expose the moving point and dependencies rather than showing only the final curve. The `locus-envelope` skill retains both the mechanism and the result.
- **Model first, decorate last.** Dynamic color and scripting examples are useful, but visual or scripted behavior must not replace the underlying mathematical dependency. Runtime skills therefore prefer native commands and prohibit arbitrary JavaScript generation.
- **Inspect residual structure, not just fit score.** Regression workflows show the source scatter plot, compare a small number of plausible models, and examine residuals before accepting a model.
- **Coordinate representations instead of duplicating objects.** GeoGebra's views expose the same construction algebraically, graphically, numerically, and spatially. The workflow skills assign each view a role and verify that a single source object updates everywhere.
- **Treat dragging as a mathematical test.** Practitioner classroom material uses simultaneous Algebra, Graphics, and Spreadsheet views to contrast changing quantities with invariants. Multi-view tasks therefore end with a parameter change or drag check, not a static screenshot.
- **Prefer native links over scripts.** Linked Input Boxes, Booleans, selected list elements, and cell references keep state inspectable. Scripts are not the default mechanism for ordinary controls or synchronization.
- **Distinguish presentation order from dependency order.** Construction Protocol records real creation dependencies. Custom teaching stages may group those steps, but must not pretend to alter the underlying construction order.
- **Multiple views are an authoring tool, not a default student layout.** Jonas Hall and Michael Borcherds warn that several windows consume space and hide a single concept behind interface complexity. GeoChat keeps multi-view layouts for genuine cross-representation investigations, but uses dynamic text or `TableText` for small result summaries.
- **Make interaction affordances obvious.** Hohenwarter and Preiner recommend visibly distinguishing movable objects and fixing objects that should not move. GeoChat adds the same rule while requiring a non-color cue for accessibility.
- **Design the first frame before adding polish.** A high-quality activity fits its main interaction on one screen, starts with readable labels, avoids crossings, and uses only a few specific tasks. GeoChat tests narrow-window behavior instead of assuming a desktop-sized worksheet.
- **Clean mathematical typography is part of correctness.** The Swedish GeoGebra Institute's builders show how `Polynomial`, `FractionText`, `FormulaText`, and `TableText` avoid zero terms, double signs, awkward fractions, and oversized spreadsheet layouts.
- **Feedback needs a neutral state.** Practitioner assessment applets avoid marking an empty input wrong, separate the solution state from its presentation, and pair color with explicit text. GeoChat adopts Boolean-driven, color-independent feedback.
- **Use indexed values for non-linear controls.** Jonas Hall's list-based slider technique maps a small integer slider through a list, giving stable discrete or non-linear values without fragile scripting. Very wide scales may use an explicit transform, and coarse/fine controls must still update one source value.
- **Use color as a stable semantic channel, not decoration.** Hohenwarter and Preiner match the colors of sliders, vectors, points, and their dynamic text. GeoChat keeps one color attached to one mathematical role and adds line style, point shape, labels, or lightness so meaning survives without color.
- **Choose the palette from the data relationship.** Cynthia Brewer separates qualitative, sequential, and diverging schemes and provides colorblind-, print-, and photocopy-safe filters. GeoChat therefore rejects rainbow palettes for unrelated categories and uses monotonic lightness for ordered values.
- **Reduce visual noise before adding polish.** Nature's figure guidance favors accessible palettes, legible standard type, labeled axes and units, while avoiding unnecessary gridlines, icons, shadows, patterns, and text over busy backgrounds. GeoChat treats axes and grid as reference layers and preserves contrast for the mathematical construction.
- **Animation needs a single purpose and timeline.** Tim Brzezinski's one-slider construction and Jonas Hall's dependent speed controls keep motion coordinated. GeoChat defaults to one master parameter and uses manual drag, one-shot explanation, or cyclic playback according to the mathematical process.
- **Motion must remain controllable.** GeoGebra exposes speed, repeat, manual stepping, and play/pause controls; WCAG requires a pause/stop mechanism for long automatic motion and warns against rapid flashing. GeoChat defaults animation off, requires play/pause/reset, and leaves a stable end frame.

## Official capability checks

- Piecewise and bounded functions: [Functions](https://geogebra.github.io/docs/manual/en/Functions/), [Function command](https://geogebra.github.io/docs/manual/en/commands/Function/)
- Parametric and polar curves: [Curves](https://geogebra.github.io/docs/manual/en/Curves/), [Curve command](https://geogebra.github.io/docs/manual/en/commands/Curve/)
- Loci and envelopes: [Locus](https://geogebra.github.io/docs/manual/en/commands/Locus/), [LocusEquation](https://geogebra.github.io/docs/manual/en/commands/LocusEquation/), [Envelope](https://geogebra.github.io/docs/manual/en/commands/Envelope/)
- List-driven construction: [Sequence](https://geogebra.github.io/docs/manual/en/commands/Sequence/)
- Symbolic geometry checks: [Prove](https://geogebra.github.io/docs/manual/en/commands/Prove/)
- Parametric surfaces: [Surface](https://geogebra.github.io/docs/manual/en/commands/Surface/)
- Sliders and animation: [Slider](https://geogebra.github.io/docs/manual/en/commands/Slider), [GeoGebra Apps API](https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API)
- Regression command family: [Statistics commands](https://geogebra.github.io/docs/manual/en/commands/Statistics_Commands/)
- View layouts and focus: [SetPerspective](https://geogebra.github.io/docs/manual/en/commands/SetPerspective/), [SetActiveView](https://geogebra.github.io/docs/manual/en/commands/SetActiveView/)
- Spreadsheet references and bulk data: [Spreadsheet View](https://geogebra.github.io/docs/manual/en/Spreadsheet_View/), [FillCells](https://geogebra.github.io/docs/manual/en/commands/FillCells/)
- Symbolic work: [CAS View](https://geogebra.github.io/docs/manual/en/CAS_View/)
- Real construction order: [Construction Protocol](https://geogebra.github.io/docs/manual/en/Construction_Protocol/)
- Native UI controls: [Action Objects](https://geogebra.github.io/docs/manual/en/Action_Objects/)
- Object presentation: [Scripting commands](https://geogebra.github.io/docs/manual/en/commands/Scripting_Commands/)
- Object styles and semantic color: [Style Bar](https://geogebra.github.io/docs/manual/en/Style_Bar/), [Dynamic Colors](https://geogebra.github.io/docs/manual/en/Dynamic_Colors/)
- Animation behavior: [Animation](https://geogebra.github.io/docs/manual/en/Animation/), [StartAnimation](https://geogebra.github.io/docs/manual/en/commands/StartAnimation/)

## Expert and practitioner references

- Tim Brzezinski, [Creating a One-Slider-Does-All Applet](https://www.geogebra.org/m/NMFFE64n)
- Tim Brzezinski and Wellerson Davi, [Illustrations Without Words](https://www.geogebra.org/m/ytn5z5uv)
- Dr. Jack L. Jackson II, [Drawing vs. Constructing, The Drag Test](https://www.geogebra.org/m/bpx3nz2d)
- Malin Christersson, [GeoGebra Tutorial — Constructions](https://www.malinc.se/math/geogebra/constructionsen.php/1000)
- Rafael Losada, [Using scripts](https://www.geogebra.org/m/wcvnvgpv)
- Kovács et al., [New tools in GeoGebra offering novel opportunities to teach loci and envelopes](https://arxiv.org/abs/1605.09153)
- GeoGebra Institute of MEI, [Graphics/Algebra views and Graphics Style Bar](https://www.geogebra.org/m/sD8tzYmz)
- Jonaki Ghosh, [Getting started with GeoGebra](https://cdn.azimpremjiuniversity.edu.in/media/publications/downloads/magazine/ATRIA-ISSUE-7-July-2020.f1624017312.pdf), especially the classroom use of simultaneous Algebra, Graphics, and Spreadsheet views for testing invariants.
- Jonas Hall and Michael Borcherds, [Why not to use multiple windows in your applets](https://www.geogebra.org/m/FhVEKcX2)
- Jonas Hall and the Swedish GeoGebra Institute, [GeoGebra Builders Handbook](https://www.geogebra.org/m/t6v92Gdz)
- Jonas Hall, [Creating a slider based on values from a list](https://www.geogebra.org/m/jJ8WhRDz)
- Markus Hohenwarter and Judith Preiner, [GeoGebra workshop design guidelines](https://www.geogebra.org/resource/QhytMdzE/lj2jeJZqlawFqfl6/material-QhytMdzE.pdf)
- Chris Cambré, [Making dynamic mathematical text readable](https://www.geogebra.org/m/XExM3PQ2) and [feedback by text](https://www.geogebra.org/m/veSYncdt)
- Tim Brzezinski, [Answers to Your GeoGebra Questions](https://www.geogebra.org/m/ks4s27ey), including formative assessment, auxiliary objects, construction protocol, and custom tools.
- Steve Phelps, [GeoGebra statistics workshops](https://www.geogebra.org/m/ekmrmmh7), connecting spreadsheet data, dynamic displays, simulations, regression, and inference.
- Cynthia Brewer and Mark Harrower, [ColorBrewer](https://colorbrewer2.org/), separating qualitative, sequential, and diverging palettes with accessibility and reproduction filters.
- Bang Wong, [Color blindness](https://doi.org/10.1038/nmeth.1618), and Okabe/Ito's [Color Universal Design](https://jfly.uni-koeln.de/color/), supplying conservative categorical palettes and color-independent encoding guidance.
- Nature Portfolio, [research figure preparation](https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/), for legibility, accessible palettes, axes/units, and removal of decorative noise.
- Jonas Hall, [Controlling sliders with sliders](https://www.geogebra.org/m/ThUVwTsZ), for coordinating range and speed through one parameter system.
- W3C WAI, [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) and [Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide), for non-color cues and controllable motion.

## Added runtime skills

- `piecewise-domain-function`
- `dynamic-parameter-exploration`
- `dynamic-construction-validation`
- `parametric-polar-curves`
- `locus-envelope`
- `list-driven-construction`
- `regression-model-diagnostics`
- `geometric-theorem-verification`
- `parametric-surface-revolution`

These nine are second-layer math skills with explicit parent links, third-layer recipe identifiers, supported GeoGebra command references, and verification or performance constraints.

## Added software-workflow skills

- `multi-view-coordination`
- `cas-graphics-workflow`
- `spreadsheet-data-workflow`
- `construction-protocol-presentation`
- `interactive-controls-workflow`
- `object-view-layer-management`
- `dynamic-worksheet-authoring`
- `dynamic-text-feedback`
- `visual-style-system`
- `mathematical-animation-design`

`multi-view-coordination` is the first-layer software workflow. The other nine are its second-layer specializations. All require runtime capability verification because GeoGebra Classic, Calculator Suite, and embedded applets do not expose identical view sets.
