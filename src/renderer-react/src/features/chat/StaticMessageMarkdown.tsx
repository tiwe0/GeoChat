import { Streamdown } from "streamdown";
import { useStreamdownTranslations } from "../../i18n/useStreamdownTranslations";
import { STREAMDOWN_PLUGINS } from "./streamdownPlugins";

export function StaticMessageMarkdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const translations = useStreamdownTranslations();
  const classes = ["copilot-markdown", "static-message-markdown", className]
    .filter(Boolean)
    .join(" ");

  return (
    <Streamdown
      animated={false}
      className={classes}
      plugins={STREAMDOWN_PLUGINS}
      translations={translations}
    >
      {children}
    </Streamdown>
  );
}
