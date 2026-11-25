import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, Paper, List, ListItemButton, ListItemText, Chip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { subscribeAllMenuItems, type MenuItem } from "../../data/menuRepository";
import { useLang } from "../../i18n/LanguageContext";
import { categoryLabel } from "./categoryLabel";
import { RefreshButton } from "../../components/RefreshButton";
import { allOf, refreshFromServer } from "../../data/refresh";
import { liveRows, visibleRows } from "../../data/cancel";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";

export function MenuListPage() {
  const navigate = useNavigate();
  const { L } = useLang();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => subscribeAllMenuItems(setItems), []);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {L("మెనూ ఐటమ్స్ & ధరలు", "Menu & pricing")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <RefreshButton onRefresh={() => refreshFromServer(allOf("menuItems"))} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/menu/new")}>
            {L("ఐటమ్ చేర్చు", "Add item")}
          </Button>
        </Box>
      </Box>

      <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={items.length - liveRows(items).length} />
      <Paper>
        {items.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {L("ఇంకా మెనూ ఐటమ్స్ లేవు.", "No menu items yet.")}
          </Typography>
        ) : (
          <List disablePadding>
            {visibleRows(items, showCancelled).map((item) => (
              <ListItemButton
                key={item.id}
                divider
                onClick={() => !item.cancelled && navigate(`/menu/${item.id}/edit`)}
                sx={{ display: "flex", justifyContent: "space-between" }}
              >
                <ListItemText
                  primary={item.name}
                  secondary={`${categoryLabel(item.category, L)} · ₹${item.pricePerPlate}${L("/ప్లేటు", "/plate")} · ${item.isVeg ? L("శాకాహారం", "Veg") : L("మాంసాహారం", "Non-Veg")}`}
                />
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                  {!item.isActive && <Chip label={L("ఆపివేశారు", "Inactive")} size="small" />}
                  {item.cancelled ? (
                    <CancelledChip archived reason={item.cancelReason} />
                  ) : (
                    <CancelButton collection="menuItems" id={item.id} what={item.name} />
                  )}
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
