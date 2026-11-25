import { useCallback, useEffect, useState } from "react";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { listImages } from "../../data/uploads";
import { PhotoUploadButton } from "../../components/PhotoUpload";
import { ErrorBox, ScreenTitle } from "../../components/ui";

/** Food / gallery photos (Storage `gallery/`). Admin and managers may upload. */
export function GalleryPage() {
  const { L } = useLang();
  const [images, setImages] = useState<{ name: string; url: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      listImages("gallery").then(
        (list) => {
          setImages(list);
          setError(null);
        },
        (e: unknown) => {
          setImages([]);
          setError(e instanceof Error ? e.message : String(e));
        },
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <ScreenTitle
        title={L("ఆహార ఫోటోలు", "Food photos")}
        subtitle={L("నిజమైన వంటల ఫోటోలు — website, కొటేషన్లకి వాడతాం.", "Real photos of our food — for the website and quotations.")}
        onRefresh={load}
        action={<PhotoUploadButton folder="gallery" size="medium" onUploaded={() => load()} />}
      />
      <ErrorBox message={error} />
      {images === null ? (
        <CircularProgress />
      ) : images.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">{L("ఇంకా ఫోటోలు లేవు.", "No photos yet.")}</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" } }}>
          {images.map((img) => (
            <Box
              key={img.name}
              component="a"
              href={img.url}
              target="_blank"
              rel="noopener"
              sx={{ display: "block", aspectRatio: "4 / 3", borderRadius: 2, overflow: "hidden", bgcolor: "#fff" }}
            >
              <Box component="img" src={img.url} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
