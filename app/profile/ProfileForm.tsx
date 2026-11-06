"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, Check, Info, Pencil, UserRound } from "lucide-react";
import { updateProfile } from "./actions";
import {
  initialProfileActionState,
  type ProfileActionState,
  type ProfileField,
} from "./profile-state";

type ProfileValues = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  image: string | null;
  role: string;
};

export default function ProfileForm({ profile }: { profile: ProfileValues }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ProfileActionState, FormData>(
    updateProfile,
    initialProfileActionState,
  );
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(profile.image);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }

    if (state.status === "success" || state.status === "unchanged") {
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
  }, [router, state]);

  useEffect(() => () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
  }, []);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (file) {
      objectUrlRef.current = URL.createObjectURL(file);
      setImagePreview(objectUrlRef.current);
    } else {
      setImagePreview(profile.image);
    }
  }

  function fieldError(field: ProfileField) {
    return state.fieldErrors?.[field]?.[0];
  }

  return (
    <main className="gg-content">
      <div className="profile-page-head">
        <h1 className="gg-page-title profile-page-title">Edit Profile</h1>
        <Link className="gg-btn gg-btn--secondary" href="/dashboard">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form className="gg-card gg-card-pad" action={formAction}>
        {state.status === "error" && (
          <p className="profile-alert" role="alert">
            <Info size={18} aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}
        {state.status === "success" && showToast && (
          <p className={`profile-success${toastVisible ? " is-visible" : ""}`} role="status" aria-hidden={!toastVisible}>
            <Check size={18} aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}
        {state.status === "unchanged" && showToast && (
          <p className={`profile-info${toastVisible ? " is-visible" : ""}`} role="status" aria-hidden={!toastVisible}>
            <Info size={18} aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}

        <section className="profile-avatar-section" aria-labelledby="profile-image-label">
          <label className="gg-label profile-avatar-label" id="profile-image-label" htmlFor="profile-image">
            Change Image
          </label>
          <div className="profile-avatar-control">
            <div className="profile-avatar-circle">
              {imagePreview ? (
                <Image
                  className="profile-avatar-image"
                  src={imagePreview}
                  alt="Profile image preview"
                  fill
                  unoptimized
                  sizes="116px"
                />
              ) : (
                <UserRound className="profile-avatar-fallback" size={60} aria-hidden="true" />
              )}
            </div>
            <label className="profile-avatar-button" htmlFor="profile-image" title="Change image">
              <Pencil aria-hidden="true" />
              <span className="sr-only">Choose a profile image</span>
            </label>
            <input
              className="profile-file-input"
              id="profile-image"
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-describedby={fieldError("image") ? "profile-image-error" : "profile-image-hint"}
              onChange={handleImageChange}
              disabled={isPending}
            />
          </div>
          <span className="gg-caption profile-image-hint" id="profile-image-hint">
            PNG, JPEG, or WebP. Maximum file size: 1 MB.
          </span>
          {fieldError("image") && (
            <span className="profile-field-error" id="profile-image-error">{fieldError("image")}</span>
          )}
        </section>

        <div className="gg-form-grid">
          <div className="gg-field">
            <label className="gg-label" htmlFor="firstName">First Name <span className="gg-req">*</span></label>
            <input
              className="gg-input"
              id="firstName"
              name="firstName"
              defaultValue={profile.firstName}
              autoComplete="given-name"
              maxLength={80}
              required
              aria-invalid={Boolean(fieldError("firstName"))}
              aria-describedby={fieldError("firstName") ? "firstName-error" : undefined}
              disabled={isPending}
            />
            {fieldError("firstName") && <span className="profile-field-error" id="firstName-error">{fieldError("firstName")}</span>}
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="lastName">Last Name <span className="gg-req">*</span></label>
            <input
              className="gg-input"
              id="lastName"
              name="lastName"
              defaultValue={profile.lastName}
              autoComplete="family-name"
              maxLength={80}
              required
              aria-invalid={Boolean(fieldError("lastName"))}
              aria-describedby={fieldError("lastName") ? "lastName-error" : undefined}
              disabled={isPending}
            />
            {fieldError("lastName") && <span className="profile-field-error" id="lastName-error">{fieldError("lastName")}</span>}
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="email">Email <span className="gg-req">*</span></label>
            <input
              className="gg-input"
              id="email"
              name="email"
              type="email"
              defaultValue={profile.email}
              autoComplete="email"
              maxLength={254}
              required
              aria-invalid={Boolean(fieldError("email"))}
              aria-describedby={fieldError("email") ? "email-error" : undefined}
              disabled={isPending}
            />
            {fieldError("email") && <span className="profile-field-error" id="email-error">{fieldError("email")}</span>}
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="phoneNumber">Phone Number</label>
            <input
              className="gg-input"
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              defaultValue={profile.phoneNumber}
              autoComplete="tel"
              maxLength={40}
              aria-invalid={Boolean(fieldError("phoneNumber"))}
              aria-describedby={fieldError("phoneNumber") ? "phoneNumber-error" : undefined}
              disabled={isPending}
            />
            {fieldError("phoneNumber") && <span className="profile-field-error" id="phoneNumber-error">{fieldError("phoneNumber")}</span>}
          </div>
          <div className="gg-field">
            <label className="gg-label" htmlFor="role">Role</label>
            <input
              className="gg-input profile-role-input"
              id="role"
              value={profile.role}
              readOnly
              aria-describedby="profile-role-hint"
            />
            <span className="gg-caption" id="profile-role-hint">Your role can only be changed by an administrator.</span>
          </div>
        </div>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            <Check aria-hidden="true" />
            {isPending ? "Saving..." : "Save"}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/dashboard" aria-disabled={isPending}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
