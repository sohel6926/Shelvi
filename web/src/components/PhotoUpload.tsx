import { useRef, useState, type ChangeEvent } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import { useLang } from "../i18n/LanguageContext";
import { checkImage, MAX_IMAGE_MB, uploadImage } from "../data/uploads";

/** One button that picks an image (camera on phones) and uploads it under `folder/`. */
export function PhotoUploadButton({
  folder,
  baseName,
  label,
  onUploaded,
  size = "small",
}: {
  folder: string;
  baseName?: string;
  label?: string;
  onUploaded: (url: string) => Promise<unknown> | void;
  size?: "small" | "medium";
}) {
  const { L } = useLang();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = checkImage(file);
    if (problem) {
      setError(
        problem === "type"
          ? L("ఫోటో (image) file మాత్రమే.", "Please choose an image file.")
          : L(`ఫోటో ${MAX_IMAGE_MB} MB లోపు ఉండాలి.`, `Image must be under ${MAX_IMAGE_MB} MB.`),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = await uploadImage(folder, file, baseName ? `${baseName}-${Date.now()}` : undefined);
      await onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.5, displayPrint: "none" }}>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <Button
        size={size}
        variant="outlined"
        startIcon={busy ? <CircularProgress size={16} /> : <AddPhotoAlternateIcon />}
        disabled={busy}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          input.current?.click();
        }}
      >
        {label ?? L("ఫోటో ఎక్కించు", "Add photo")}
      </Button>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );
}
