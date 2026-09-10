import { useEffect, useRef } from "react";
import { animate } from "motion/mini";
import {
  ROLE_STROKE,
  arcPath,
  circlePath,
  createProjection,
  distance,
  lineEndpoints,
  rightAnglePath,
  type Element,
  type Figure
} from "./geometry";

/**
 * How long each kind of element takes to draw itself, in seconds.
 *
 * The whole hero sequence must land in about two seconds. A construction that
 * takes four seconds to resolve leaves the first-time visitor looking at an
 * unfinished figure for longer than they will wait, so these are deliberately
 * brisk — fast enough to feel drawn, short enough to be over.
 */
const DURATION: Record<Element["kind"], number> = {
  point: 0.22,
  segment: 0.34,
  line: 0.42,
  circle: 0.72,
  arc: 0.5,
  polygon: 0.6,
  rightAngle: 0.2
};

/** Overlap between consecutive elements, so the sequence reads as one gesture. */
const OVERLAP = 0.13;

type Props = {
  figure: Figure;
  /** Accessible description of what the finished construction shows. */
  title: string;
  width?: number;
  className?: string;
  /** Seconds to wait after the figure scrolls into view. */
  delay?: number;
  strokeWidth?: number;
};

export function ConstructionFigure({
  figure,
  title,
  width = 400,
  className,
  delay = 0,
  strokeWidth = 1.75
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const project = createProjection(figure, width);

  /**
   * The figure is rendered complete. The animation *removes* the finished
   * state and replays it, and only ever runs on the client, after hydration.
   * That ordering is deliberate: the prerendered HTML, a browser with JS
   * disabled, and a headless screenshot all show a valid finished figure,
   * so the reveal can never strand the section blank.
   */
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    const strokes = Array.from(
      svg.querySelectorAll<SVGGeometryElement>("[data-draw]")
    );
    const marks = Array.from(svg.querySelectorAll<SVGElement>("[data-mark]"));

    // Hide before the browser paints the animated state.
    for (const el of strokes) {
      const length = el.getTotalLength();
      el.style.strokeDasharray = `${length}`;
      el.style.strokeDashoffset = `${length}`;
    }
    for (const el of marks) {
      el.style.opacity = "0";
    }

    let cancelled = false;

    // A plain IntersectionObserver rather than motion's inView: it is the same
    // few lines, and it keeps this file on motion/mini, which is a fraction of
    // the size of the full package.
    const observer = new IntersectionObserver(
      (entries, self) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || cancelled) return;

        // Play once. A figure that redraws every time it scrolls past turns an
        // explanation into a fidget.
        self.disconnect();

        let at = delay;
        for (const el of svg.querySelectorAll<SVGElement>("[data-draw],[data-mark]")) {
          const kind = (el.dataset.kind ?? "segment") as Element["kind"];
          const duration = DURATION[kind] ?? 0.4;

          if (el.dataset.draw !== undefined) {
            animate(
              el,
              { strokeDashoffset: 0 },
              { duration, delay: at, ease: [0.16, 1, 0.3, 1] }
            );
          } else {
            animate(
              el,
              { opacity: 1 },
              { duration: Math.max(duration, 0.28), delay: at, ease: "easeOut" }
            );
          }
          at += Math.max(duration - OVERLAP, 0.08);
        }
      },
      { threshold: 0.55 }
    );

    observer.observe(svg);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [figure, delay]);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${project.width} ${project.height}`}
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      {/* No overflow:visible here. Lines are unbounded by definition, and the
          viewBox is what stops them at the edge of the plate instead of letting
          them bleed across the page. Figure windows carry enough margin for
          point labels to stay inside. */}
      {figure.elements.map((element) =>
        renderElement(element, figure, project, strokeWidth)
      )}
    </svg>
  );
}

function renderElement(
  element: Element,
  figure: Figure,
  project: ReturnType<typeof createProjection>,
  strokeWidth: number
) {
  const stroke = ROLE_STROKE[element.role];
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const
  };

  switch (element.kind) {
    case "point": {
      const [cx, cy] = project.toSvg(element.at);
      // Dot and label share one animation slot: treating them as two elements
      // doubled the length of the sequence for no visual gain.
      return (
        <g key={element.id} data-mark data-kind="point">
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
        </g>
      );
    }

    case "segment": {
      const [x1, y1] = project.toSvg(element.from);
      const [x2, y2] = project.toSvg(element.to);
      return (
        <path
          key={element.id}
          data-draw
          data-kind="segment"
          d={`M ${x1} ${y1} L ${x2} ${y2}`}
          {...common}
        />
      );
    }

    case "line": {
      const [start, end] = lineEndpoints(element.through, element.direction, figure);
      const [x1, y1] = project.toSvg(start);
      const [x2, y2] = project.toSvg(end);
      return (
        <path
          key={element.id}
          data-draw
          data-kind="line"
          d={`M ${x1} ${y1} L ${x2} ${y2}`}
          {...common}
          opacity={0.9}
        />
      );
    }

    case "circle": {
      const radius =
        element.radius ?? (element.through ? distance(element.center, element.through) : 1);
      return (
        <path
          key={element.id}
          data-draw
          data-kind="circle"
          d={circlePath(element.center, radius, project)}
          {...common}
        />
      );
    }

    case "arc":
      return (
        <path
          key={element.id}
          data-draw
          data-kind="arc"
          d={arcPath(element.center, element.radius, element.fromDeg, element.toDeg, project)}
          {...common}
        />
      );

    case "polygon": {
      const d =
        element.points
          .map((p, i) => {
            const [x, y] = project.toSvg(p);
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ") + " Z";
      return <path key={element.id} data-draw data-kind="polygon" d={d} {...common} />;
    }

    case "rightAngle":
      return (
        <path
          key={element.id}
          data-draw
          data-kind="rightAngle"
          d={rightAnglePath(element.at, element.a, element.b, project)}
          {...common}
          strokeWidth={1.25}
        />
      );
  }
}
