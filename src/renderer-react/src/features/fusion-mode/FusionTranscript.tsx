import { Box, Paper, Stack, Typography } from "@mui/material";
import type { FusionChatMessage } from "./types";
import { FusionAssistantMessage } from "./FusionAssistantMessage";

function userMessageText(message: FusionChatMessage) {
  return message.parts.map((part) => {
    if (part.type === "text") return part.text;
    if (part.type === "file") return part.filename ?? part.mediaType;
    return "";
  }).filter(Boolean).join("\n");
}

export function FusionTranscript(props: {
  messages: readonly FusionChatMessage[];
  streaming: boolean;
  emptyLabel: string;
  ariaLabel: string;
}) {
  if (props.messages.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{props.emptyLabel}</Typography>;
  }
  return (
    <Stack role="region" aria-label={props.ariaLabel} spacing={1} sx={{ minHeight: 0, flex: 1, overflowY: "auto", p: 1.5, bgcolor: "background.default", scrollbarWidth: "thin" }}>
      {props.messages.map((message) => (
        <Paper
          key={message.id}
          variant={message.role === "user" ? "elevation" : "outlined"}
          elevation={message.role === "user" ? 1 : 0}
          sx={{
            alignSelf: message.role === "user" ? "flex-end" : "stretch",
            maxWidth: message.role === "user" ? "86%" : "100%",
            px: 1.25,
            py: 1,
            borderRadius: message.role === "user" ? "16px 16px 5px 16px" : 2,
            bgcolor: message.role === "user" ? "primary.main" : "background.paper",
            color: message.role === "user" ? "primary.contrastText" : "text.primary",
            overflowWrap: "anywhere",
          }}
        >
          {message.role === "assistant"
            ? <FusionAssistantMessage message={message} active={props.streaming && message === props.messages.at(-1)} />
            : <Box component="span" sx={{ whiteSpace: "pre-wrap" }}>{userMessageText(message)}</Box>}
        </Paper>
      ))}
    </Stack>
  );
}
