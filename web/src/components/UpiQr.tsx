import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useLang } from "../i18n/LanguageContext";

/**
 * R10-3: the server's `upi://pay?...` payload drawn as a QR image (prints on the invoice).
 * The payload is used exactly as the server made it — amount and note are not touched here.
 * The QR library is loaded only when a document with a UPI payload is opened.
 */
export function UpiQr({ payload, size = 168 }: { payload: string; size?: number }) {
  const { L } = useLang();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      // qrcode is CommonJS: depending on the bundler the functions sit on the namespace or on `default`.
      .then((mod) => {
        const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
        return QR.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: size * 2 });
      })
      .then((url) => {
        if (alive) {
          setSrc(url);
          setFailed(false);
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [payload, size]);

  if (failed) {
    return (
      <Typography variant="caption" component="p" sx={{ wordBreak: "break-all", fontFamily: "monospace" }}>
        {payload}
      </Typography>
    );
  }
  return (
    <Box
      component="img"
      src={src ?? undefined}
      alt={L("UPI QR — ఏ UPI app తో అయినా scan చేయండి", "UPI QR — scan with any UPI app")}
      sx={{
        width: size,
        height: size,
        display: "block",
        bgcolor: "#fff",
        border: "1px solid #ddd",
        borderRadius: 1,
        imageRendering: "pixelated",
        visibility: src ? "visible" : "hidden",
        "@media print": { border: "none" },
      }}
    />
  );
}
