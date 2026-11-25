/** Dishes named in a menu package's groups (matched on nameEn / nameTe, case-insensitive) or with dishIds on options. */
export function dishIdsForMenu(groups: { te: string; en: string; dishId?: string }[][], dishes: { id: string; nameEn: string; nameTe: string }[]): string[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const out = new Set<string>();
  for (const g of groups) {
    for (const o of g) {
      if (o.dishId) {
        out.add(o.dishId);
        continue;
      }
      const hit = dishes.find((d) => (d.nameEn && norm(d.nameEn) === norm(o.en)) || (d.nameTe && norm(d.nameTe) === norm(o.te)));
      if (hit) out.add(hit.id);
    }
  }
  return [...out];
}

