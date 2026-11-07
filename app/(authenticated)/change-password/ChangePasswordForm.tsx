"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Info } from "lucide-react";
import { changePassword } from "./actions";
import {
  initialPasswordActionState,
  type PasswordActionState,
} from "./password-state";

type PasswordField = "currentPassword" | "newPassword" | "confirmNewPassword";

const fields: { name: PasswordField; label: string; autoComplete: string }[] = [
  { name: "currentPassword", label: "Current Password", autoComplete: "current-password" },
  { name: "newPassword", label: "New Password", autoComplete: "new-password" },
  { name: "confirmNewPassword", label: "Confirm New Password", autoComplete: "new-password" },
];

export default function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState<PasswordActionState, FormData>(
    changePassword,
    initialPasswordActionState,
  );
  const [visibleFields, setVisibleFields] = useState<PasswordField[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [passwords, setPasswords] = useState<Record<PasswordField, string>>({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });

  useEffect(() => {
    if (state.status === "success") {
      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      });
      setVisibleFields([]);
    }

    if (state.status === "success" || state.status === "error") {
      setShowToast(true);
      setToastVisible(true);
      const hideTimeout = window.setTimeout(() => setToastVisible(false), 2500);
      const removeTimeout = window.setTimeout(() => setShowToast(false), 2800);
      return () => {
        window.clearTimeout(hideTimeout);
        window.clearTimeout(removeTimeout);
      };
    }

    setToastVisible(false);
    setShowToast(false);
  }, [state]);

  function toggleField(name: PasswordField) {
    setVisibleFields((current) =>
      current.includes(name) ? current.filter((field) => field !== name) : [...current, name],
    );
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.currentTarget;
    if (name in passwords) {
      setPasswords((current) => ({ ...current, [name]: value }));
    }
  }

  return (
    <main className="gg-content">
      <div className="profile-page-head">
        <h1 className="gg-page-title profile-page-title">Change Password</h1>
        <Link className="gg-btn gg-btn--secondary" href="/dashboard">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form className="gg-card gg-card-pad" action={formAction} noValidate>
        <div className="password-form-fields">
          {fields.map(({ name, label, autoComplete }) => {
            const isVisible = visibleFields.includes(name);
            return (
              <div className="gg-field" key={name}>
                <label className="gg-label" htmlFor={name}>
                  {label} <span className="gg-req">*</span>
                </label>
                <div className="password-input-wrap">
                  <input
                    className="gg-input password-input"
                    id={name}
                    name={name}
                    type={isVisible ? "text" : "password"}
                    value={passwords[name]}
                    onChange={handlePasswordChange}
                    autoComplete={autoComplete}
                    required
                    minLength={name === "newPassword" ? 8 : undefined}
                    disabled={isPending}
                  />
                  <button
                    className="password-visibility-toggle"
                    type="button"
                    aria-label={`${isVisible ? "Hide" : "Show"} ${label.toLowerCase()}`}
                    aria-pressed={isVisible}
                    onClick={() => toggleField(name)}
                    disabled={isPending}
                  >
                    {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            <Check aria-hidden="true" />
            {isPending ? "Updating..." : "Update Password"}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/dashboard" aria-disabled={isPending}>
            Cancel
          </Link>
        </div>
      </form>

      {state.status === "success" && showToast && (
        <p
          className={`password-toast password-toast-success${toastVisible ? " is-visible" : ""}`}
          role="status"
          aria-hidden={!toastVisible}
        >
          <Check size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      )}
      {state.status === "error" && showToast && (
        <p
          className={`password-toast password-toast-error${toastVisible ? " is-visible" : ""}`}
          role="alert"
          aria-hidden={!toastVisible}
        >
          <Info size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      )}
    </main>
  );
}
