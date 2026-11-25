import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Paper, TextField, Button, Alert, CircularProgress, Checkbox, FormControlLabel } from "@mui/material";
import { getCustomer, saveCustomer } from "../../data/customerRepository";
import { useSession } from "../../auth/AuthProvider";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { HistorySection } from "../../components/HistoryList";

export function CustomerFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const session = useSession();
  const { L, lang } = useLang();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [allergyNote, setAllergyNote] = useState("");
  /** R10-8 */
  const [optIn, setOptIn] = useState(false);
  const [optInLoaded, setOptInLoaded] = useState(false);
  const [optInAt, setOptInAt] = useState<Date | null>(null);
  const [optOutAt, setOptOutAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getCustomer(id).then((c) => {
      if (c) {
        setName(c.name);
        setPhone(c.phone);
        setEmail(c.email);
        setAddress(c.address);
        setNotes(c.notes);
        setAllergyNote(c.allergyNote);
        setOptIn(c.whatsappOptIn);
        setOptInLoaded(c.whatsappOptIn);
        setOptInAt(c.optInAt);
        setOptOutAt(c.optOutAt);
      }
      setLoading(false);
    });
  }, [id]);

  async function handleSave() {
    if (!name.trim()) {
      setError(L("పేరు తప్పనిసరి", "Name is required"));
      return;
    }
    if (session.status !== "loggedIn") return;
    setSaving(true);
    setError(null);
    try {
      await saveCustomer(
        {
          id,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          notes: notes.trim(),
          allergyNote: allergyNote.trim(),
          whatsappOptIn: optIn,
        },
        session.profile.uid
      );
      navigate("/customers");
    } catch {
      setError(L("కస్టమర్ save కాలేదు", "Failed to save customer"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        {isEdit ? L("కస్టమర్ వివరాలు మార్చు", "Edit customer") : L("కొత్త కస్టమర్", "New customer")}
      </Typography>
      <Paper sx={{ p: 3 }}>
        <TextField label={L("పేరు", "Name")} fullWidth margin="normal" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label={L("ఫోన్", "Phone")} fullWidth margin="normal" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField label={L("ఈమెయిల్", "Email")} fullWidth margin="normal" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label={L("చిరునామా", "Address")}
          fullWidth
          margin="normal"
          multiline
          minRows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <TextField
          label={L("గమనికలు", "Notes")}
          fullWidth
          margin="normal"
          multiline
          minRows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <TextField
          label={L("అలెర్జీ / తినకూడనివి (ఉంటే)", "Allergies / cannot eat (if any)")}
          helperText={L("ఈ customer కు లేదా వారి అతిథులకు ఏవైనా ఉంటే రాయండి — ఆ customer బుకింగ్‌ల అలెర్జీ షీట్‌లో కనిపిస్తుంది.", "Write anything this customer or their guests cannot eat — it shows on the allergen sheet of their bookings.")}
          fullWidth
          margin="normal"
          multiline
          minRows={2}
          value={allergyNote}
          onChange={(e) => setAllergyNote(e.target.value)}
        />
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Checkbox checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />}
          label={L("WhatsApp లో మెసేజ్ పంపడానికి customer అనుమతి ఇచ్చారు", "Customer agreed to WhatsApp messages")}
        />
        {optIn === optInLoaded && (optIn ? optInAt : optOutAt) && (
          <Typography variant="body2" color="text.secondary">
            {optIn ? L("అనుమతి ఇచ్చిన తేదీ", "Agreed on") : L("అనుమతి తీసేసిన తేదీ", "Withdrawn on")}:{" "}
            {(optIn ? optInAt : optOutAt)!.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric" })}
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? L("Save అవుతోంది…", "Saving…") : L("Save చేయి", "Save")}
          </Button>
          <Button onClick={() => navigate("/customers")}>{L("వద్దు", "Cancel")}</Button>
          {id && (
            <Button variant="outlined" onClick={() => navigate(`/customers/${id}/statement`)} sx={{ ml: "auto" }}>
              {L("ఖాతా వివరాలు", "Statement")}
            </Button>
          )}
        </Box>
      </Paper>
      {id && <HistorySection collection="customers" docId={id} />}
    </Box>
  );
}
