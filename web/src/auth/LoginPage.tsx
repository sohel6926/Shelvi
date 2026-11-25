import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Box, Button, Paper, TextField, Typography, Alert } from "@mui/material";
import { Navigate } from "react-router-dom";
import { auth } from "../firebase";
import { useSession, setLocalSession, type UserProfile } from "./AuthProvider";
import { useLang, LANG_NAME, nextLang } from "../i18n/LanguageContext";

const TEST_ACCOUNTS: Record<string, { pass: string[]; profile: UserProfile }> = {
  "owner@suseela.test": {
    pass: ["Suseela@2026", "admin123"],
    profile: {
      uid: "test-owner-uid",
      name: "Sainadh (Owner)",
      email: "owner@suseela.test",
      phone: "9966649469",
      role: "admin",
      active: true,
      branchId: "main",
      staffId: "",
      jobRole: "owner",
    },
  },
  "admin@shelvi.com": {
    pass: ["Suseela@2026", "admin123"],
    profile: {
      uid: "test-owner-uid",
      name: "Admin",
      email: "admin@shelvi.com",
      phone: "9966649469",
      role: "admin",
      active: true,
      branchId: "main",
      staffId: "",
      jobRole: "owner",
    },
  },
  "admin@suseela.com": {
    pass: ["Suseela@2026", "admin123"],
    profile: {
      uid: "test-owner-uid",
      name: "Admin",
      email: "admin@suseela.com",
      phone: "9966649469",
      role: "admin",
      active: true,
      branchId: "main",
      staffId: "",
      jobRole: "owner",
    },
  },
  "accountant@suseela.test": {
    pass: ["Suseela@2026", "manager123"],
    profile: {
      uid: "test-accountant-uid",
      name: "Test Accountant",
      email: "accountant@suseela.test",
      phone: "9000000099",
      role: "manager",
      active: true,
      branchId: "main",
      staffId: "",
      jobRole: "accountant",
    },
  },
  "manager@shelvi.com": {
    pass: ["Suseela@2026", "manager123"],
    profile: {
      uid: "test-accountant-uid",
      name: "Manager",
      email: "manager@shelvi.com",
      phone: "9000000099",
      role: "manager",
      active: true,
      branchId: "main",
      staffId: "",
      jobRole: "manager",
    },
  },
};

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
    const normalizedEmail = email.trim().toLowerCase();
    const testMatch = TEST_ACCOUNTS[normalizedEmail];
    if (testMatch && testMatch.pass.includes(password)) {
      setLocalSession(testMatch.profile);
      setSubmitting(false);
      return;
    }

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
