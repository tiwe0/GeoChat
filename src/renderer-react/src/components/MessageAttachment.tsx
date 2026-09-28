import { FileTextIcon } from "lucide-react";
import { Box, Stack, Typography } from "@mui/material";
import type { FileUIPart } from "ai";
import { useTranslation } from "react-i18next";

type MessageAttachmentProps = {
  part: FileUIPart;
};

export function MessageAttachment({ part }: MessageAttachmentProps) {
  const { t } = useTranslation();

  if (part.mediaType.startsWith("image/")) {
    return (
      <Box
        component="img"
        src={part.url}
        alt={part.filename ?? t("composer.attachedImage")}
        loading="lazy"
        sx={{
          display: "block",
          width: "100%",
          maxHeight: 180,
          objectFit: "contain",
          borderRadius: 1,
          bgcolor: "background.default",
        }}
      />
    );
  }

  return (
    <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
      <FileTextIcon size={18} style={{ flex: "0 0 auto" }} />
      <Typography variant="caption" noWrap title={part.filename}>
        {part.filename ?? t("common.attachment")}
      </Typography>
    </Stack>
  );
}
