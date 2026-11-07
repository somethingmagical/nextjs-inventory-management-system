"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ArrowLeft, Check, Info } from "lucide-react";
import {
  initialSupplierActionState,
  type SupplierActionState,
  type SupplierField,
} from "./action-state";
import { useRetainedFormValues } from "@/components/shared/useRetainedFormValues";
import { CountryCityFields, PhoneNumberInput } from "@/components/shared/GeographyFields";

type SupplierFormAction = (
  state: SupplierActionState,
  formData: FormData,
) => Promise<SupplierActionState>;

const fields: {
  name: SupplierField;
  label: string;
  type: string;
  placeholder: string;
  autoComplete: string;
  maxLength: number;
}[] = [
  { name: "name", label: "Name", type: "text", placeholder: "Enter Name", autoComplete: "organization", maxLength: 120 },
  { name: "email", label: "Email", type: "email", placeholder: "Enter Email", autoComplete: "email", maxLength: 191 },
  { name: "phoneNumber", label: "Phone Number", type: "tel", placeholder: "Phone Number", autoComplete: "tel", maxLength: 40 },
  { name: "address", label: "Address", type: "text", placeholder: "Enter Address", autoComplete: "street-address", maxLength: 191 },
];

export default function SupplierForm({
  mode,
  action,
  initialValues,
}: {
  mode: "create" | "edit";
  action: SupplierFormAction;
  initialValues?: Partial<Record<SupplierField, string>>;
}) {
  const [state, formAction, isPending] = useActionState<SupplierActionState, FormData>(
    action,
    initialSupplierActionState,
  );
  const { formRef, retainValues } = useRetainedFormValues(state, state.status === "error");
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [phoneCountrySelection, setPhoneCountrySelection] = useState<{
    countryCode: string;
    version: number;
  } | null>(null);

  useEffect(() => {
    if (state.status === "success" && mode === "edit") {
      window.location.assign("/suppliers?updated=1");
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
  }, [mode, state]);

  function fieldError(field: SupplierField) {
    return state.fieldErrors?.[field]?.[0];
  }

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{mode === "create" ? "Create Supplier" : "Edit Supplier"}</h1>
        <Link className="gg-btn gg-btn--secondary" href="/suppliers">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form ref={formRef} onSubmit={retainValues} className="gg-card gg-card-pad" action={formAction} noValidate>
        <div className="exp-grid">
          {fields.map(({ name, label, type, placeholder, autoComplete, maxLength }) => {
            const error = fieldError(name);
            if (name === "phoneNumber") {
              return (
                <PhoneNumberInput
                  key={name}
                  defaultValue={initialValues?.phoneNumber ?? ""}
                  error={error}
                  disabled={isPending}
                  required
                  countryCode={countryCode}
                  onCountryCodeChange={(nextCountryCode) => {
                    setPhoneCountrySelection((current) => ({
                      countryCode: nextCountryCode,
                      version: (current?.version ?? 0) + 1,
                    }));
                  }}
                />
              );
            }

            return (
              <div className="gg-field" key={name}>
                <label className="gg-label" htmlFor={name}>
                  {label} <span className="gg-req">*</span>
                </label>
                <input
                  className="gg-input"
                  id={name}
                  name={name}
                  type={type}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  maxLength={maxLength}
                  defaultValue={initialValues?.[name] ?? ""}
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${name}-error` : undefined}
                  disabled={isPending}
                />
                {error && <span className="warehouse-field-error" id={`${name}-error`}>{error}</span>}
              </div>
            );
          })}
          <CountryCityFields
            initialCountry={initialValues?.country}
            initialCity={initialValues?.city}
            countryError={fieldError("country")}
            cityError={fieldError("city")}
            disabled={isPending}
            onCountryCodeChange={setCountryCode}
            phoneCountrySelection={phoneCountrySelection}
          />
        </div>

        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            <Check aria-hidden="true" />
            {isPending ? (mode === "create" ? "Saving..." : "Updating...") : (mode === "create" ? "Save" : "Update")}
          </button>
          <Link className="gg-btn gg-btn--secondary" href="/suppliers" aria-disabled={isPending}>
            Cancel
          </Link>
        </div>
      </form>

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
    </main>
  );
}
