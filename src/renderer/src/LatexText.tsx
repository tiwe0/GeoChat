import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { parseLatexSegments } from "./math-rendering";

type KatexRenderer = {
  renderToString: typeof import("katex").renderToString;
};

let katexRenderer: KatexRenderer | undefined;
let katexRendererPromise: Promise<KatexRenderer> | undefined;
const katexHtmlCache = new Map<string, string>();

function loadKatexRenderer() {
  if (katexRenderer) return Promise.resolve(katexRenderer);
  katexRendererPromise ??= Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css")
  ]).then(([katex]) => {
    katexRenderer = {
      renderToString: katex.renderToString
    };
    return katexRenderer;
  });
  return katexRendererPromise;
}

function renderLatexWith(renderer: KatexRenderer, value: string, displayMode: boolean) {
  try {
    return renderer.renderToString(value, {
      displayMode,
      output: "html",
      strict: "ignore",
      throwOnError: false,
      trust: false
    });
  } catch {
    return undefined;
  }
}

function LatexMath(props: { value: string; display?: boolean }) {
  const cacheKey = createMemo(() => `${props.display ? "1" : "0"}:${props.value}`);
  const [html, setHtml] = createSignal<string>();
  let renderVersion = 0;

  createEffect(() => {
    const value = props.value;
    const display = Boolean(props.display);
    const key = cacheKey();
    const cached = katexHtmlCache.get(key);
    if (cached) {
      setHtml(cached);
      return;
    }
    const currentVersion = ++renderVersion;
    if (katexRenderer) {
      const rendered = renderLatexWith(katexRenderer, value, display);
      if (rendered) katexHtmlCache.set(key, rendered);
      setHtml(rendered);
      return;
    }
    setHtml(undefined);
    void loadKatexRenderer().then((renderer) => {
      if (currentVersion !== renderVersion) return;
      const rendered = renderLatexWith(renderer, value, display);
      if (rendered) katexHtmlCache.set(key, rendered);
      setHtml(rendered);
    });
  });

  onCleanup(() => {
    renderVersion += 1;
  });

  return (
    <span
      classList={{ "latex-math": true, display: Boolean(props.display) }}
      innerHTML={html() ?? props.value}
    />
  );
}

export function LatexText(props: { text: string; class?: string }) {
  const segments = createMemo(() => parseLatexSegments(props.text));
  return (
    <span class={props.class ? `latex-text ${props.class}` : "latex-text"}>
      <For each={segments()}>
        {(segment) => (
          <Show
            when={segment.type === "math"}
            fallback={<span class="latex-plain">{segment.value}</span>}
          >
            <LatexMath value={segment.value} display={segment.display} />
          </Show>
        )}
      </For>
    </span>
  );
}
