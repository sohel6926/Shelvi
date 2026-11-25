import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useSession } from "../../auth/AuthProvider";
import { useLang } from "../../i18n/LanguageContext";
import { saveVendor, subscribeVendors, type Vendor } from "../../data/records";
import { DataTable, PageHeader } from "../../components/DataTable";
import { allOf, refreshFromServer } from "../../data/refresh";
import { liveRows, visibleRows } from "../../data/cancel";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";

type VendorDraft = Pick<Vendor, "name" | "phone" | "address" | "notes"> & { id?: string };
const EMPTY: VendorDraft = { name: "", phone: "", address: "", notes: "" };

export function VendorsPage() {
  const session = useSession();
  const { L } = useLang();
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VendorDraft | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeVendors(setVendors), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleRows(vendors, showCancelled).filter((v) => !q || v.name.toLowerCase().includes(q) || v.phone.includes(q));
  }, [vendors, search, showCancelled]);

  async function handleSave() {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError(L("పేరు తప్పనిసరి", "Name is required"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveVendor({
        id: editing.id,
        name: editing.name.trim(),
        phone: editing.phone.trim(),
        address: editing.address.trim(),
        notes: editing.notes.trim(),
      });
      setEditing(null);
    } catch {
      setError(L("సరఫరాదారు save కాలేదు", "Could not save vendor"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("సరఫరాదారులు", "Vendors")}
        onRefresh={() => refreshFromServer(allOf("vendors"))}
        action={
          isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
              {L("సరఫరాదారుని చేర్చు", "Add vendor")}
            </Button>
          )
        }
      />
      <TextField
        size="small"
        fullWidth
        placeholder={L("పేరు / ఫోన్ వెతకండి", "Search name or phone")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1 }}
      />
      <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={vendors.length - liveRows(vendors).length} />
      <DataTable
        rows={filtered}
        rowKey={(v) => v.id}
        onRowClick={isAdmin ? (v) => !v.cancelled && setEditing({ id: v.id, name: v.name, phone: v.phone, address: v.address, notes: v.notes }) : undefined}
        emptyText={L("ఇంకా సరఫరాదారులు లేరు.", "No vendors yet.")}
        columns={[
          {
            label: L("పేరు", "Name"),
            render: (v) => (
              <>
                {v.name} {v.cancelled && <CancelledChip archived reason={v.cancelReason} />}
              </>
            ),
          },
          { label: L("ఫోన్", "Phone"), render: (v) => v.phone || "—" },
          { label: L("చిరునామా", "Address"), hideOnMobile: true, render: (v) => v.address || "—" },
          { label: L("గమనికలు", "Notes"), hideOnMobile: true, render: (v) => v.notes || "—" },
          { label: "", render: (v) => (v.cancelled ? null : <CancelButton collection="vendors" id={v.id} what={v.name} />) },
        ]}
      />

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.id ? L("సరఫరాదారు వివరాలు మార్చు", "Edit vendor") : L("కొత్త సరఫరాదారు", "New vendor")}</DialogTitle>
        {editing && (
          <DialogContent>
            <TextField label={L("పేరు", "Name")} fullWidth margin="dense" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextField label={L("ఫోన్", "Phone")} fullWidth margin="dense" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <TextField
              label={L("చిరునామా", "Address")}
              fullWidth
              margin="dense"
              multiline
              minRows={2}
              value={editing.address}
              onChange={(e) => setEditing({ ...editing, address: e.target.value })}
            />
            <TextField
              label={L("గమనికలు", "Notes")}
              fullWidth
              margin="dense"
              multiline
              minRows={2}
              value={editing.notes}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{L("వద్దు", "Cancel")}</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? L("Save అవుతోంది…", "Saving…") : L("Save చేయి", "Save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
