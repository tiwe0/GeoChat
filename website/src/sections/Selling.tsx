import { ConstructionFigure } from "../components/figures/ConstructionFigure";
import { sellingPointFigures } from "../components/figures/figures";
import { Container } from "../components/Layout";
import { useContent } from "../i18n";
import type { Role } from "../components/figures/geometry";
import type { SellingPoint } from "../i18n/types";

const ROLE_ORDER: Role[] = ["ink", "construct", "result"];

const ROLE_TEXT: Record<Role, string> = {
  ink: "text-ink",
  construct: "text-construct",
  result: "text-result"
};

const ROLE_BG: Record<Role, string> = {
  ink: "bg-ink",
  construct: "bg-construct",
  result: "bg-result"
};

export function Selling() {
  const t = useContent();

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    label: t.legend[role],
    items: t.selling.items.filter((item) => item.role === role)
  })).filter((group) => group.items.length > 0);

  return (
    <section id="what" className="scroll-mt-14 border-b border-rule py-20 sm:py-24">
      <Container>
        <header className="max-w-[46rem]">
          <h2 className="text-title font-semibold">{t.selling.title}</h2>
          <p className="measure mt-5 text-lede text-ink-soft">{t.selling.lede}</p>
        </header>

        <div className="mt-16 flex flex-col gap-16">
          {grouped.map((group) => (
            <div key={group.role}>
              {/* Role band header: the figure colors below are not decorative,
                  and this rule is where the page says so out loud. */}
              <div className="flex items-center gap-3.5 border-t border-rule pt-4">
                <span
                  aria-hidden="true"
                  className={`h-[3px] w-7 shrink-0 rounded-full ${ROLE_BG[group.role]}`}
                />
                <h3
                  className={`text-[0.8125rem] font-semibold tracking-[0.01em] ${ROLE_TEXT[group.role]}`}
                >
                  {group.label}
                </h3>
              </div>

              <div className="mt-9 grid gap-x-14 gap-y-14 sm:grid-cols-2">
                {group.items.map((item) => (
                  <Item key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Item({ item }: { item: SellingPoint }) {
  const figure = sellingPointFigures[item.id];

  return (
    <article>
      {figure ? (
        <ConstructionFigure
          figure={figure}
          title={item.title}
          width={260}
          className="mb-7 h-[9.5rem] w-auto"
          strokeWidth={1.6}
        />
      ) : null}

      <h4 className="text-[1.1875rem] font-semibold tracking-[-0.01em]">
        {item.title}
      </h4>
      <p className="measure mt-2.5 text-[0.9375rem] leading-relaxed text-ink-soft">
        {item.body}
      </p>
      {item.literal ? (
        <p className="mt-3.5 font-mono text-[0.75rem] leading-relaxed text-ink-faint">
          {item.literal}
        </p>
      ) : null}
    </article>
  );
}
