import { Box, Button, Paper, Typography } from "@mui/material";
import { signOutApp } from "./AuthProvider";
import { useLang } from "../i18n/LanguageContext";

/** Shown to a signed-in user an admin has not approved yet (users/{uid}.active == false). */
export function PendingApproval({ name }: { name: string }) {
  const { L } = useLang();
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
      <Paper sx={{ p: 4, maxWidth: 440, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>
          {name
            ? L(`నమస్తే ${name}, అనుమతి కోసం ఎదురుచూస్తున్నాం`, `Hi ${name}, waiting for approval`)
            : L("అనుమతి కోసం ఎదురుచూస్తున్నాం", "Waiting for approval")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {L(
            "మీ account తయారైంది. Admin approve చేసిన తర్వాత CRM వాడొచ్చు.",
            "Your account is created. An admin must approve it before you can use the CRM.",
          )}
        </Typography>
        <Button variant="outlined" onClick={() => signOutApp()}>
          {L("బయటకు", "Log out")}
        </Button>
      </Paper>
    </Box>
  );
}
