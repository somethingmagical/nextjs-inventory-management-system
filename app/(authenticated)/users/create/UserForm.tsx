"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, Check, Info, Pencil, UserRound } from "lucide-react";
import {
  initialUserActionState,
  type UserActionState,
  type UserField,
} from "./action-state";
import { useRetainedFormValues } from "@/components/shared/useRetainedFormValues";
import { PhoneNumberInput } from "@/components/shared/GeographyFields";

type UserRoleOption = { id: string; name: string };
type UserFormAction = (
  state: UserActionState,
  formData: FormData,
) => Promise<UserActionState>;

export type UserInitialValues = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  image: string | null;
};

export default function UserForm({
  mode,
  action,
  roles,
  initialValues,
}: {
  mode: "create" | "edit";
  action: UserFormAction;
  roles: UserRoleOption[];
  initialValues?: UserInitialValues;
}) {
  const [state, formAction, isPending] = useActionState<UserActionState, FormData>(
    action,
    initialUserActionState,
  );
  const { formRef, retainValues } = useRetainedFormValues(state, state.status === "error");
  const router = useRouter();
  const [imagePreview, setImagePreview] = useState<string | null>(initialValues?.image ?? null);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "success" && mode === "edit") {
      router.push("/users?updated=1");
      return;
    }

    if (state.status !== "error") {
      setShowToast(false);
      setToastVisible(false);
      return;
    }

    setShowToast(true);
    setToastVisible(true);
    const hideTimeout = window.setTimeout(() => setToastVisible(false), 5000);
    const removeTimeout = window.setTimeout(() => setShowToast(false), 5300);
    return () => {
      window.clearTimeout(hideTimeout);
      window.clearTimeout(removeTimeout);
    };
  }, [mode, router, state]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = file ? URL.createObjectURL(file) : null;
    setImagePreview(objectUrlRef.current ?? initialValues?.image ?? null);
  }

  function fieldError(field: UserField) {
    return state.fieldErrors?.[field]?.[0];
  }

  const initials = `${initialValues?.firstName.slice(0, 1) ?? ""}${initialValues?.lastName.slice(0, 1) ?? ""}`.toUpperCase();

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{mode === "create" ? "Create User" : "Edit User"}</h1>
        <Link className="gg-btn gg-btn--secondary" href="/users">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form ref={formRef} onSubmit={retainValues} className="gg-card gg-card-pad" action={formAction} noValidate>
        <section className="profile-avatar-section" aria-labelledby="user-image-label">
          <label className="gg-label profile-avatar-label" id="user-image-label" htmlFor="user-image">
            User Image
          </label>
          <div className="profile-avatar-control">
            <div className="profile-avatar-circle">
              {imagePreview ? (
                <Image
                  className="profile-avatar-image"
                  src={imagePreview}
                  alt="User image preview"
                  fill
                  unoptimized
                  sizes="116px"
                />
              ) : (
                <span className="user-image-fallback" aria-hidden="true">
                  {initials || <UserRound size={52} />}
                </span>
              )}
            </div>
            <label className="profile-avatar-button" htmlFor="user-image" title="Choose image">
              <Pencil aria-hidden="true" />
              <span className="sr-only">Choose a user image</span>
            </label>
            <input
              className="profile-file-input"
              id="user-image"
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-describedby={fieldError("image") ? "user-image-error" : "user-image-hint"}
              onChange={handleImageChange}
              disabled={isPending}
            />
          </div>
          <span className="gg-caption profile-image-hint" id="user-image-hint">
            PNG, JPEG, or WebP. Maximum file size: 1 MB.
          </span>
          {fieldError("image") && (
            <span className="profile-field-error" id="user-image-error">{fieldError("image")}</span>
          )}
        </section>

        <div className="gg-form-grid">
          <UserTextField
            name="firstName"
            label="First Name"
            type="text"
            defaultValue={initialValues?.firstName ?? ""}
            autoComplete="given-name"
            required
            error={fieldError("firstName")}
            disabled={isPending}
          />
          <UserTextField
            name="lastName"
            label="Last Name"
            type="text"
            defaultValue={initialValues?.lastName ?? ""}
            autoComplete="family-name"
            required
            error={fieldError("lastName")}
            disabled={isPending}
          />
          <UserTextField
            name="email"
            label="Email"
            type="email"
            defaultValue={initialValues?.email ?? ""}
            autoComplete="email"
            required
            error={fieldError("email")}
            disabled={isPending}
          />
          <PhoneNumberInput
            defaultValue={initialValues?.phoneNumber ?? ""}
            error={fieldError("phoneNumber")}
            disabled={isPending}
          />

          <div className="gg-field">
            <label className="gg-label" htmlFor="role">Role <span className="gg-req">*</span></label>
            <select
              className="gg-select user-role-select"
              id="role"
              name="role"
              defaultValue={initialValues?.role ?? ""}
              required
              aria-invalid={Boolean(fieldError("role"))}
              aria-describedby={fieldError("role") ? "role-error" : undefined}
              disabled={isPending}
            >
              <option value="" disabled>Select a role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            {fieldError("role") && <span className="profile-field-error" id="role-error">{fieldError("role")}</span>}
          </div>

          <div className="user-password-section">
            <h2 className="gg-card-title">{mode === "create" ? "Set Password" : "Change Password"}</h2>
            {mode === "edit" && <p className="gg-caption">Leave both fields blank to keep the current password.</p>}
          </div>
          <UserTextField
            name="password"
            label={mode === "create" ? "Password" : "New Password"}
            type="password"
            autoComplete={mode === "create" ? "new-password" : "new-password"}
            required={mode === "create"}
            error={fieldError("password")}
            disabled={isPending}
          />
          <UserTextField
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            autoComplete="new-password"
            required={mode === "create"}
            error={fieldError("confirmPassword")}
            disabled={isPending}
          />
        </div>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending || roles.length === 0}>
            <Check aria-hidden="true" />
            {isPending ? (mode === "create" ? "Creating..." : "Updating...") : (mode === "create" ? "Create User" : "Update User")}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/users" aria-disabled={isPending}>
            Cancel
          </Link>
        </div>

        {roles.length === 0 && (
          <p className="profile-alert" role="alert">No active roles are available. Add a role before creating or editing users.</p>
        )}
        {state.status === "error" && showToast && (
          <p
            className={`warehouse-toast${toastVisible ? " is-visible" : ""}`}
            role="alert"
            aria-hidden={!toastVisible}
          >
            <Info size={18} aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}
      </form>
    </main>
  );
}

function UserTextField({
  name,
  label,
  type,
  defaultValue,
  autoComplete,
  required = false,
  error,
  disabled,
}: {
  name: "firstName" | "lastName" | "email" | "password" | "confirmPassword";
  label: string;
  type: string;
  defaultValue?: string;
  autoComplete: string;
  required?: boolean;
  error?: string;
  disabled: boolean;
}) {
  return (
    <div className="gg-field">
      <label className="gg-label" htmlFor={name}>
        {label}{required && <> <span className="gg-req">*</span></>}
      </label>
      <input
        className="gg-input"
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        maxLength={name === "password" || name === "confirmPassword" ? 128 : name === "email" ? 254 : 80}
        minLength={type === "password" && required ? 8 : undefined}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        disabled={disabled}
      />
      {error && <span className="profile-field-error" id={`${name}-error`}>{error}</span>}
    </div>
  );
}
