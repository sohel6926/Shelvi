import { ThemeProvider, CssBaseline } from "@mui/material";
import { theme } from "./theme/tokens";
import { AuthProvider } from "./auth/AuthProvider";
import { BranchProvider } from "./session/BranchContext";
import { AppRouter } from "./routes/AppRouter";
import { LanguageProvider } from "./i18n/LanguageContext";

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LanguageProvider>
        <AuthProvider>
          <BranchProvider>
            <AppRouter />
          </BranchProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
