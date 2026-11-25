import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Box, Button, Paper, TextField, Typography, Alert } from "@mui/material";
import { Navigate } from "react-router-dom";
import { auth } from "../firebase";
import { useSession } from "./AuthProvider";
import { useLang, LANG_NAME, nextLang } from "../i18n/LanguageContext";

export function LoginPage() {
  const session = useSession();
  const { L, lang, uiLang, toggle } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError(L("లాగిన్ కాలేదు. Email, password సరిచూసి మళ్ళీ ప్రయత్నించండి.", "Couldn't sign in. Check your email and password and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  // Signed in (also right after a successful sign-in): leave the login page.
  if (session.status === "loggedIn") return <Navigate to="/" replace />;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "grey.100",
      }}
    >
      <Paper elevation={2} sx={{ p: 4, width: 360, maxWidth: "calc(100vw - 32px)" }}>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={toggle}
            lang={lang === "te" ? "en" : "te"}
            aria-label={`Switch language: ${LANG_NAME[nextLang(uiLang)]}`}
          >
            {LANG_NAME[nextLang(uiLang)]}
          </Button>
        </Box>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
          {L("సుశీల క్యాటరింగ్స్ CRM", "Suseela Caterings CRM")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {L("ఫోన్ app లో వాడే account తోనే లాగిన్ అవ్వండి.", "Sign in with the same account you use on the phone app.")}
        </Typography>
        <form onSubmit={handleSubmit}>
          <TextField
            label={L("ఈమెయిల్", "Email")}
            type="email"
            fullWidth
            required
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label={L("పాస్‌వర్డ్", "Password")}
            type="password"
            fullWidth
            required
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          <Button type="submit" variant="contained" fullWidth sx={{ mt: 3 }} disabled={submitting}>
            {submitting ? L("లాగిన్ అవుతోంది…", "Signing in…") : L("లాగిన్", "Sign in")}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
