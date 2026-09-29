import { Typography } from "@mui/material";
import { GeoChatThread } from "../assistant-ui";

export function FusionTranscript(props: {
  emptyLabel: string;
  ariaLabel: string;
}) {
  return (
    <GeoChatThread
      ariaLabel={props.ariaLabel}
      surface="transcript"
      classNames={{
        root: "geochat-assistant-thread geochat-assistant-thread--transcript",
        viewport: "geochat-assistant-thread__viewport",
        userMessage: "geochat-assistant-message geochat-assistant-message--user",
        assistantMessage: "geochat-assistant-message geochat-assistant-message--assistant",
        systemMessage: "geochat-assistant-message geochat-assistant-message--system",
        messageContent: "geochat-assistant-message__content",
      }}
      empty={(
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          {props.emptyLabel}
        </Typography>
      )}
    />
  );
}
