import { useEffect, useRef, useState } from "react";
import { Container } from "../components/Layout";
import { circumcircle } from "../components/figures/figures";
import {
  ROLE_STROKE,
  circlePath,
  createProjection,
  distance,
  lineEndpoints,
  type Element,
  type Role
} from "../components/figures/geometry";
import { useContent } from "../i18n";

/**
 * Which figure elements exist at each pipeline stage, and how many command
 * lines have been emitted by then. The figure, the code and the prose advance
 * together — that synchronisation is the whole point of the section, so the
 * mapping lives in one place where a mismatch is obvious.
 */
const STAGES: Array<{ elements: string[]; lines: number }> = [
  { elements: ["A", "B", "C", "AB", "BC", "CA"], lines: 3 },
  { elements: ["A", "B", "C", "AB", "BC", "CA", "m1", "m2"], lines: 5 },
  { elements: ["A", "B", "C", "AB", "BC", "CA", "m1", "m2", "O"], lines: 6 },
  { elements: ["A", "B", "C", "AB", "BC", "CA", "m1", "m2", "O", "k"], lines: 8 }
];

/** Command line index -> notation role, matching the figure element it creates. */
const LINE_ROLES: Role[] = [
  "ink",
  "ink",
  "ink",
  "construct",
  "construct",
  "construct",
  "result",
  "result"
];

const LAST_STAGE = STAGES.length - 1;

export function Pipeline() {
  const t = useContent();
  /**
   * Starts complete. Client-side scroll tracking then rewinds it to 0 — so the
   * prerendered HTML and a no-JS visitor get the finished construction and all
   * eight commands, rather than an empty panel.
   */
  const [stage, setStage] = useState(LAST_STAGE);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    setStage(0);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (Number.isInteger(index)) setStage(index);
        }
      },
      // A narrow band across the middle of the viewport: the step sitting in
      // the reader's line of sight is the active one.
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    for (const node of stepRefs.current) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  const codeLines = t.pipeline.steps[2]?.code ?? [];
  const visibleLines = STAGES[stage]?.lines ?? codeLines.length;

  return (
    <section id="how" className="scroll-mt-14 border-b border-rule py-20 sm:py-24">
      <Container>
        <header className="max-w-[46rem]">
          <h2 className="text-title font-semibold">{t.pipeline.title}</h2>
          <p className="measure mt-5 text-lede text-ink-soft">{t.pipeline.lede}</p>
        </header>

        <p className="mt-12 border-t border-rule pt-5 font-serif text-[1.25rem] leading-snug text-ink sm:text-[1.4375rem]">
          {t.pipeline.problem}
        </p>

        <div className="mt-4 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-16">
          {/* Panel first in DOM order so it can stick above the steps on
              narrow screens, then move to the right column on desktop. */}
          <div className="sticky top-[3.5rem] z-10 -mx-5 bg-paper px-5 py-6 sm:-mx-8 sm:px-8 lg:order-2 lg:top-24 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:py-10">
            <StagedFigure stage={stage} />

            <div className="mt-6 overflow-x-auto">
              <pre className="min-w-max font-mono text-[0.75rem] leading-[1.85] sm:text-[0.8125rem]">
                <code>
                  {codeLines.map((line, index) => (
                    <span
                      key={line}
                      className="block transition-opacity duration-500 ease-quart"
                      style={{
                        color: `var(--color-${LINE_ROLES[index] ?? "ink"})`,
                        opacity: index < visibleLines ? 1 : 0.14
                      }}
                    >
                      {line}
                    </span>
                  ))}
                </code>
              </pre>
            </div>
          </div>

          <ol className="lg:order-1">
            {t.pipeline.steps.map((step, index) => {
              const active = index === stage;
              return (
                <li
                  key={step.label}
                  data-index={index}
                  ref={(node) => {
                    stepRefs.current[index] = node;
                  }}
                  className="border-t border-rule py-9 first:border-t-0 lg:py-14"
                >
                  <div className="flex items-baseline gap-3.5">
                    <span
                      aria-hidden="true"
                      className="font-mono text-[0.75rem] text-ink-faint transition-colors duration-300"
                      style={active ? { color: "var(--color-result)" } : undefined}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-[1.3125rem] font-semibold tracking-[-0.015em]">
                      {step.label}
                    </h3>
                  </div>
                  <p
                    className="measure mt-3 pl-[2.1rem] text-[0.9375rem] leading-relaxed transition-colors duration-300"
                    style={{
                      color: active ? "var(--color-ink)" : "var(--color-ink-soft)"
                    }}
                  >
                    {step.caption}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>
    </section>
  );
}

/**
 * The hero's construction, revealed by stage rather than drawn by time. Uses
 * opacity so the transition doubles as its own reduced-motion behaviour.
 */
function StagedFigure({ stage }: { stage: number }) {
  const t = useContent();
  const project = createProjection(circumcircle, 420);
  const visible = new Set(STAGES[stage]?.elements ?? []);

  return (
    <svg
      viewBox={`0 0 ${project.width} ${project.height}`}
      className="mx-auto w-full max-w-[22rem] lg:max-w-[26rem]"
      role="img"
      aria-label={t.hero.figureAlt}
      fill="none"
    >
      {circumcircle.elements.map((element) => (
        <g
          key={element.id}
          className="transition-opacity duration-[550ms] ease-quart"
          style={{ opacity: visible.has(element.id) ? 1 : 0 }}
        >
          {staticElement(element, project)}
        </g>
      ))}
    </svg>
  );
}

function staticElement(
  element: Element,
  project: ReturnType<typeof createProjection>
) {
  const stroke = ROLE_STROKE[element.role];
  const common = {
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const
  };

  switch (element.kind) {
    case "point": {
      const [cx, cy] = project.toSvg(element.at);
      return (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={4}
            fill={stroke}
            stroke="var(--color-paper)"
            strokeWidth={2}
          />
          {element.label ? (
            <text
              x={cx + 9}
              y={cy - 9}
              fill={stroke}
              fontSize={15}
              fontFamily="var(--font-serif)"
              fontStyle="italic"
            >
              {element.label}
            </text>
          ) : null}
        </>
      );
    }
    case "segment": {
      const [x1, y1] = project.toSvg(element.from);
      const [x2, y2] = project.toSvg(element.to);
      return <path d={`M ${x1} ${y1} L ${x2} ${y2}`} {...common} />;
    }
    case "line": {
      const [start, end] = lineEndpoints(element.through, element.direction, circumcircle);
      const [x1, y1] = project.toSvg(start);
      const [x2, y2] = project.toSvg(end);
      return <path d={`M ${x1} ${y1} L ${x2} ${y2}`} {...common} opacity={0.9} />;
    }
    case "circle": {
      const radius =
        element.radius ??
        (element.through ? distance(element.center, element.through) : 1);
      return <path d={circlePath(element.center, radius, project)} {...common} />;
    }
    default:
      return null;
  }
}
