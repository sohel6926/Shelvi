import { getDownloadURL, listAll, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase";

/**
 * Image uploads (docs/api-contract.md → Manager uploads). Admin and managers may upload bill photos
 * (`expenses/{branchId}/…`, `purchases/{branchId}/…`), food / gallery photos (`gallery/…`) and menu
 * photos (`menus/…`). Logo and signature (`settings/…`) are owner-only — see settingsRepository.ts.
 */
export const MAX_IMAGE_MB = 10;

export function checkImage(file: File): "type" | "size" | null {
  if (!file.type.startsWith("image/")) return "type";
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return "size";
  return null;
}

function safeExt(name: string): string {
  return ((name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg").slice(0, 5);
}

/** Uploads under `folder/` (no trailing slash) and returns the download URL. */
export async function uploadImage(folder: string, file: File, baseName = String(Date.now())): Promise<string> {
  const fileRef = ref(storage, `${folder}/${baseName}.${safeExt(file.name)}`);
  await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(fileRef);
}

/** Download URLs of the images directly inside `folder/`. */
export async function listImages(folder: string): Promise<{ name: string; url: string }[]> {
  const res = await listAll(ref(storage, folder));
  const items = await Promise.all(res.items.map(async (i) => ({ name: i.name, url: await getDownloadURL(i) })));
  return items.sort((a, b) => b.name.localeCompare(a.name));
}
