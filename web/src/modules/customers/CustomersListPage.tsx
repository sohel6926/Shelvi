import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { subscribeCustomers, type Customer } from "../../data/customerRepository";
import { RefreshButton } from "../../components/RefreshButton";
import { allOf, refreshFromServer } from "../../data/refresh";
import { useLang } from "../../i18n/LanguageContext";
import { liveRows, visibleRows } from "../../data/cancel";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";

export function CustomersListPage() {
  const navigate = useNavigate();
  const { L } = useLang();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => subscribeCustomers(setCustomers), []);

  const filtered = visibleRows(customers, showCancelled).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {L("కస్టమర్లు", "Customers")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <RefreshButton onRefresh={() => refreshFromServer(allOf("customers"))} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/customers/new")}>
            {L("కస్టమర్‌ని చేర్చు", "Add customer")}
          </Button>
        </Box>
      </Box>

      <TextField
        placeholder={L("పేరు / ఫోన్ తో వెతకండి", "Search by name or phone")}
        fullWidth
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1 }}
      />
      <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={customers.length - liveRows(customers).length} />

      <Paper>
        {filtered.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {L("ఇంకా కస్టమర్లు లేరు.", "No customers yet.")}
          </Typography>
        ) : (
          <List disablePadding>
            {filtered.map((c) => (
              <ListItemButton key={c.id} divider onClick={() => !c.cancelled && navigate(`/customers/${c.id}/edit`)}>
                <ListItemText primary={c.name} secondary={c.phone} />
                {c.cancelled ? <CancelledChip archived reason={c.cancelReason} /> : <CancelButton collection="customers" id={c.id} what={c.name} />}
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
