/** Menu category names shown on screen (the stored value stays the English key). */
export function categoryLabel(c: string, L: (te: string, en: string) => string): string {
  switch (c) {
    case "Starter": return L("స్టార్టర్", "Starter");
    case "Main Course": return L("ప్రధాన వంటకం", "Main Course");
    case "Dessert": return L("స్వీట్", "Dessert");
    case "Beverage": return L("పానీయం", "Beverage");
    case "Package": return L("ప్యాకేజీ", "Package");
    default: return c;
  }
}
