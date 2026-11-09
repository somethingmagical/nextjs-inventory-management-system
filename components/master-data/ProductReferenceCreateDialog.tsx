"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Check, Image as ImageIcon, Pencil, X } from "lucide-react";
import { createBrand } from "@/app/(authenticated)/brands/actions";
import { createCategory } from "@/app/(authenticated)/product-categories/actions";
import { createSupplier } from "@/app/(authenticated)/suppliers/create/actions";
import { initialSupplierActionState } from "@/app/(authenticated)/suppliers/create/action-state";
import { createWarehouse } from "@/app/(authenticated)/warehouse/create/actions";
import { initialWarehouseActionState } from "@/app/(authenticated)/warehouse/create/action-state";
import { CountryCityFields, PhoneNumberInput } from "@/components/shared/GeographyFields";

export type ProductReferenceKind = "category" | "brand" | "supplier" | "warehouse";

type CreateResult = {
  status: "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  createdId?: string;
  createdName?: string;
};

const referenceLabels: Record<ProductReferenceKind, string> = {
  category: "Product Category",
  brand: "Brand",
  supplier: "Supplier",
  warehouse: "Warehouse",
};

async function createReference(
  kind: ProductReferenceKind,
  formData: FormData,
): Promise<CreateResult> {
  if (kind === "category") return createCategory(formData);
  if (kind === "brand") return createBrand(formData);
  if (kind === "supplier") {
    formData.set("inlineCreate", "1");
    const result = await createSupplier(initialSupplierActionState, formData);
    if (result.status !== "success") {
      return {
        status: "error",
        message: result.message || "Supplier creation did not complete. Please try again.",
        fieldErrors: result.fieldErrors,
      };
    }
    return {
      status: "success",
      message: result.message,
      createdId: result.createdId,
      createdName: result.createdName,
    };
  }

  formData.set("inlineCreate", "1");
  const result = await createWarehouse(initialWarehouseActionState, formData);
  if (result.status !== "success") {
    return {
      status: "error",
      message: result.message || "Warehouse creation did not complete. Please try again.",
      fieldErrors: result.fieldErrors,
    };
  }
  return {
    status: "success",
    message: result.message,
    createdId: result.createdId,
    createdName: result.createdName,
  };
}

export default function ProductReferenceCreateDialog({
  kind,
  onClose,
  onCreated,
}: {
  kind: ProductReferenceKind;
  onClose: () => void;
  onCreated: (reference: { id: string; name: string }) => void;
}) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string[]>>>();
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [countryCode, setCountryCode] = useState("");
  const [phoneCountrySelection, setPhoneCountrySelection] = useState<{
    countryCode: string;
    version: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const hasLogo = kind === "category" || kind === "brand";
  const isSupplier = kind === "supplier";
  const isWarehouse = kind === "warehouse";
  const label = referenceLabels[kind];
  const prefix = `quick-${kind}`;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function close(force = false) {
    if (isPending && !force) return;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    onClose();
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(objectUrlRef.current);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setFieldErrors(undefined);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createReference(kind, formData);
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        return;
      }

      if (!result.createdId || !result.createdName) {
        setMessage(`${label} was created, but could not be selected. Refresh the page to see it.`);
        return;
      }

      onCreated({ id: result.createdId, name: result.createdName });
      close(true);
    });
  }

  function fieldError(field: string) {
    return fieldErrors?.[field]?.[0];
  }

  return (
    <div
      className="gg-overlay is-open"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        className="gg-modal master-data-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${prefix}-modal-title`}
        onSubmit={handleSubmit}
      >
        <div className="gg-modal-head">
          <h2 className="gg-card-title" id={`${prefix}-modal-title`}>Create {label}</h2>
          <button
            className="gg-modal-close"
            type="button"
            aria-label="Close"
            onClick={() => close()}
            disabled={isPending}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={`gg-modal-body${isSupplier || isWarehouse ? " product-reference-modal-body" : ""}`}>
          <div className="gg-field">
            <label className="gg-label" htmlFor={`${prefix}-name`}>
              Name <span className="gg-req">*</span>
            </label>
            <input
              className="gg-input"
              id={`${prefix}-name`}
              name="name"
              placeholder="Enter Name"
              maxLength={hasLogo ? 191 : 120}
              required
              autoFocus
              aria-invalid={Boolean(fieldError("name"))}
              aria-describedby={fieldError("name") ? `${prefix}-name-error` : undefined}
              disabled={isPending}
            />
            {fieldError("name") && (
              <span className="profile-field-error" id={`${prefix}-name-error`}>{fieldError("name")}</span>
            )}
          </div>

          {(isSupplier || isWarehouse) && (
            <>
              <div className="gg-field">
                <label className="gg-label" htmlFor={`${prefix}-email`}>
                  Email <span className="gg-req">*</span>
                </label>
                <input
                  className="gg-input"
                  id={`${prefix}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter Email"
                  maxLength={191}
                  required
                  aria-invalid={Boolean(fieldError("email"))}
                  aria-describedby={fieldError("email") ? `${prefix}-email-error` : undefined}
                  disabled={isPending}
                />
                {fieldError("email") && (
                  <span className="warehouse-field-error" id={`${prefix}-email-error`}>{fieldError("email")}</span>
                )}
              </div>
              <PhoneNumberInput
                required
                disabled={isPending}
                countryCode={countryCode}
                onCountryCodeChange={(nextCountryCode) => {
                  setPhoneCountrySelection((current) => ({
                    countryCode: nextCountryCode,
                    version: (current?.version ?? 0) + 1,
                  }));
                }}
                error={fieldError("phoneNumber")}
              />
              <CountryCityFields
                countryError={fieldError("country")}
                cityError={fieldError("city")}
                postalError={fieldError("zipCode")}
                disabled={isPending}
                showPostalCode={isWarehouse}
                onCountryCodeChange={setCountryCode}
                phoneCountrySelection={phoneCountrySelection}
              />
              {isSupplier && (
                <div className="gg-field">
                  <label className="gg-label" htmlFor={`${prefix}-address`}>
                    Address <span className="gg-req">*</span>
                  </label>
                  <input
                    className="gg-input"
                    id={`${prefix}-address`}
                    name="address"
                    autoComplete="street-address"
                    placeholder="Enter Address"
                    maxLength={191}
                    required
                    aria-invalid={Boolean(fieldError("address"))}
                    aria-describedby={fieldError("address") ? `${prefix}-address-error` : undefined}
                    disabled={isPending}
                  />
                  {fieldError("address") && (
                    <span className="warehouse-field-error" id={`${prefix}-address-error`}>{fieldError("address")}</span>
                  )}
                </div>
              )}
            </>
          )}

          {hasLogo && (
            <div className="gg-field">
              <label className="gg-label" htmlFor={`${prefix}-logo`}>Change Logo</label>
              <div className="logo-drop">
                {preview ? (
                  <Image src={preview} alt="Logo preview" fill unoptimized sizes="116px" />
                ) : (
                  <ImageIcon className="ph" aria-hidden="true" />
                )}
                <label className="logo-edit" htmlFor={`${prefix}-logo`} title="Choose logo">
                  <Pencil aria-hidden="true" />
                </label>
                <input
                  className="profile-file-input"
                  id={`${prefix}-logo`}
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  ref={fileInputRef}
                  onChange={handleLogoChange}
                  disabled={isPending}
                  aria-describedby={fieldError("logo") ? `${prefix}-logo-error` : `${prefix}-logo-hint`}
                />
              </div>
              <span className="gg-caption" id={`${prefix}-logo-hint`}>
                PNG, JPEG, or WebP. Maximum file size: 2 MB.
              </span>
              {fieldError("logo") && (
                <span className="profile-field-error" id={`${prefix}-logo-error`}>{fieldError("logo")}</span>
              )}
            </div>
          )}

          {message && <p className="profile-alert" role="alert">{message}</p>}
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            <Check aria-hidden="true" />
            {isPending ? "Saving..." : "Save"}
          </button>
          <button className="gg-btn gg-btn--secondary" type="button" onClick={() => close()} disabled={isPending}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
