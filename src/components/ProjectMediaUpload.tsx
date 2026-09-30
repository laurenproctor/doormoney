"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishProjectMedia, reserveProjectMedia } from "@/app/actions/project-updates";
import { supabaseBrowser } from "@/lib/supabase/client";

export function ProjectMediaUpload({ updateId }: { updateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="mt-5 grid gap-3" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError("This file is over 50 MB. Embed a larger video instead."); return; }
    setBusy(true); setError("");
    const alt = (form.elements.namedItem("alt") as HTMLInputElement).value;
    const caption = (form.elements.namedItem("caption") as HTMLInputElement).value;
    try {
      const reservation = await reserveProjectMedia(updateId, file.type, alt, caption);
      if (reservation.error || !reservation.path || !reservation.token) throw new Error(reservation.error ?? "Upload failed.");
      const sb = supabaseBrowser();
      if (!sb) throw new Error("Uploads are unavailable.");
      const { error: uploadError } = await sb.storage.from("project-updates")
        .uploadToSignedUrl(reservation.path, reservation.token, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const finished = await finishProjectMedia(updateId, reservation.path);
      if (finished.error) throw new Error(finished.error);
      form.reset(); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setBusy(false); }
  }}>
    <label className="text-[15px]">Image or video (JPEG, PNG, WebP, MP4, WebM; up to 50 MB)
      <input name="file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required className="mt-2 block w-full text-[15px]" />
    </label>
    <label className="text-[15px]">Image description (required for images)
      <input name="alt" maxLength={300} className="mt-2 block w-full rounded border border-line bg-transparent p-3" />
    </label>
    <label className="text-[15px]">Caption (optional)
      <input name="caption" maxLength={500} className="mt-2 block w-full rounded border border-line bg-transparent p-3" />
    </label>
    {error && <p role="alert" className="text-[14px]">{error}</p>}
    <button disabled={busy} className="w-fit rounded border border-current px-5 py-3 text-[15px] disabled:opacity-50">{busy ? "Uploading…" : "Add media"}</button>
  </form>;
}
