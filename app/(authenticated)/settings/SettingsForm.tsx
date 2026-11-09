"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Check, Info, Upload } from "lucide-react";
import { updateApplicationSettings } from "./actions";
import { initialSettingsActionState } from "./action-state";

export default function SettingsForm({
  settings,
}: {
  settings: { appName: string; faviconPath: string };
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateApplicationSettings,
    initialSettingsActionState,
  );
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [faviconName, setFaviconName] = useState("");
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function handleFaviconChange(event: ChangeEvent<HTMLInputElement>) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const file = event.currentTarget.files?.[0];
    objectUrlRef.current = file ? URL.createObjectURL(file) : null;
    setFaviconName(file?.name ?? "");
    setFaviconPreview(objectUrlRef.current);
  }

  return (
    <form action={formAction} className="gg-card gg-card-pad password-form-fields">
      {state.status === "error" && (
        <p className="profile-alert" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      )}
      {state.status === "success" && (
        <p className="profile-success is-visible" role="status">
          <Check size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      )}

      <div className="settings-row">
        <div className="settings-row-description">
          <label className="gg-label" htmlFor="application-name">
            Website name <span className="gg-req">*</span>
          </label>
          <span className="gg-caption">Used for page titles and application branding.</span>
        </div>
        <input
          className="gg-input"
          id="application-name"
          name="appName"
          type="text"
          maxLength={100}
          defaultValue={settings.appName}
          required
          disabled={isPending}
        />
      </div>

      <div className="settings-row">
        <div className="settings-row-description">
          <label className="gg-label" htmlFor="application-favicon">Favicon</label>
          <span className="gg-caption">ICO or PNG, up to 2 MB. Leave empty to keep the current favicon.</span>
        </div>
        <div className="settings-favicon-control">
          <div className="settings-favicon-preview">
            <Image
              className="profile-avatar-image"
              src={faviconPreview ?? settings.faviconPath}
              alt="Current favicon preview"
              fill
              unoptimized
              sizes="52px"
            />
          </div>
          <div className="settings-file-picker">
            <input
              className="settings-file-input"
              id="application-favicon"
              name="favicon"
              type="file"
              accept=".ico,.png,image/x-icon,image/vnd.microsoft.icon,image/png"
              onChange={handleFaviconChange}
              disabled={isPending}
            />
            <label className="settings-file-button" htmlFor="application-favicon">
              <Upload size={16} aria-hidden="true" />
              Choose file
            </label>
            <span className="settings-file-name" aria-live="polite">
              {faviconName || "No file chosen"}
            </span>
          </div>
        </div>
      </div>

      <div className="gg-form-actions">
        <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}
