import type { EventTypeCode } from "../data/bookingRepository";

export const EVENT_TYPE_LABEL: Record<EventTypeCode, { te: string; en: string }> = {
  wedding: { te: "పెళ్ళి", en: "Wedding" },
  annadanam: { te: "అన్నదానం", en: "Annadanam" },
  housewarming: { te: "గృహప్రవేశం", en: "Housewarming" },
  office: { te: "ఆఫీస్ కార్యక్రమం", en: "Office event" },
  other: { te: "ఇతర", en: "Other" },
};
