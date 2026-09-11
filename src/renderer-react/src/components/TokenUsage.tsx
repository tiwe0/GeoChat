import { Stack, Typography } from "@mui/material";
import type { UIMessage } from "ai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessageMetadata, ChatTokenUsage } from "@geochat-ai/app/contracts";

type TokenUsageProps = {
  messages: UIMessage<ChatMessageMetadata>[];
};

function aggregateTokenUsage(messages: UIMessage<ChatMessageMetadata>[]): ChatTokenUsage {
  return messages.reduce<ChatTokenUsage>((total, message) => {
    const usage = message.metadata?.tokenUsage;
    if (!usage) return total;
    return {
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    };
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

export function TokenUsage({ messages }: TokenUsageProps) {
  const { t, i18n } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const usage = aggregateTokenUsage(messages);
  if (usage.totalTokens === 0) return null;

  const input = numberFormatter.format(usage.inputTokens);
  const output = numberFormatter.format(usage.outputTokens);
  const total = numberFormatter.format(usage.totalTokens);

  return (
    <Stack
      direction="row"
      spacing={0.75}
      aria-label={t("tokens.ariaLabel", { input, output, total })}
      sx={{
        alignSelf: "stretch",
        justifyContent: "flex-end",
        pt: 0.25,
        color: "text.secondary",
      }}
    >
      <Typography variant="caption">{t("tokens.label")}</Typography>
      <Typography variant="caption">{t("tokens.input", { count: input })}</Typography>
      <Typography variant="caption">{t("tokens.ai", { count: output })}</Typography>
      <Typography variant="caption">{t("tokens.total", { count: total })}</Typography>
    </Stack>
  );
}
