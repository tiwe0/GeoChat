import { useRef, useState } from "react";
import { Container } from "../components/Layout";
import { useContent, useLocale } from "../i18n";

/**
 * The video is the only "try before you install" path on this site, so it has
 * to be there — but it must cost nothing until asked for. preload="none" plus
 * a poster means a visitor who never clicks downloads a 30 KB image, not 3.7 MB
 * of H.264.
 */
export function Demo() {
  const t = useContent();
  const locale = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const src = locale === "zh" ? "/media/demo-zh.mp4" : "/media/demo-en.mp4";
  const poster = locale === "zh" ? "/media/poster-zh.webp" : "/media/poster-en.webp";
  // The two recordings are framed differently — the Chinese one is cropped to
  // the app window, the English one pans — so the box has to match each file
  // or the poster letterboxes inside it.
  const aspect = locale === "zh" ? "1280 / 818" : "1280 / 886";

  function play() {
    setStarted(true);
    // The element already exists; starting playback from the overlay keeps the
    // native controls as the only playback UI once it is running.
    requestAnimationFrame(() => void videoRef.current?.play());
  }

  return (
    <section id="demo" className="scroll-mt-14 border-b border-rule py-20 sm:py-24">
      <Container>
        <header className="max-w-[46rem]">
          <h2 className="text-title font-semibold">{t.demo.title}</h2>
          <p className="measure mt-5 text-lede text-ink-soft">{t.demo.lede}</p>
        </header>

        <div className="relative mt-12 overflow-hidden rounded-xl border border-rule bg-paper-deep">
          <video
            ref={videoRef}
            className="block w-full"
            style={{ aspectRatio: aspect }}
            src={src}
            poster={poster}
            preload="none"
            controls={started}
            playsInline
            muted
            loop
          >
            {t.demo.fallback}
          </video>

          {started ? null : (
            <button
              type="button"
              onClick={play}
              className="group absolute inset-0 flex items-center justify-center bg-ink/8 transition-colors hover:bg-ink/16"
            >
              <span className="flex items-center gap-3 rounded-full bg-paper/95 px-6 py-3.5 text-[0.9375rem] font-medium text-ink shadow-[0_8px_28px_-10px_oklch(0.22_0.012_250/0.45)] transition-transform duration-200 ease-quart group-hover:scale-[1.03]">
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5 fill-result"
                  aria-hidden="true"
                >
                  <path d="M3 1.5 14 8 3 14.5Z" />
                </svg>
                {t.demo.play}
              </span>
            </button>
          )}
        </div>
      </Container>
    </section>
  );
}

export function Shots() {
  const t = useContent();
  const locale = useLocale();
  const base = locale === "zh" ? "shot-zh" : "shot-en";

  return (
    <section className="border-b border-rule bg-paper-sunk py-20 sm:py-24">
      <Container>
        <header className="max-w-[46rem]">
          <h2 className="text-title font-semibold">{t.shots.title}</h2>
          <p className="measure mt-5 text-lede text-ink-soft">{t.shots.lede}</p>
        </header>

        <figure className="mt-12">
          <img
            src={`/media/${base}-1600.webp`}
            srcSet={`/media/${base}-960.webp 960w, /media/${base}-1600.webp 1600w`}
            sizes="(min-width: 1200px) 1140px, 100vw"
            width={1600}
            height={1071}
            alt={t.shots.alt}
            loading="lazy"
            decoding="async"
            className="w-full rounded-xl border border-rule bg-paper"
          />
        </figure>
      </Container>
    </section>
  );
}
