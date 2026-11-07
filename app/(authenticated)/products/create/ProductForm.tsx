"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ImagePlus, Info, X } from "lucide-react";
import {
  initialProductActionState,
  type ProductActionState,
  type ProductField,
} from "./action-state";
import type { ProductFormValues } from "../product-schema";
import { useRetainedFormValues } from "@/components/shared/useRetainedFormValues";

type ProductFormAction = (
  state: ProductActionState,
  formData: FormData,
) => Promise<ProductActionState>;

type ProductOption = { id: string; name: string; value?: string };
type ProductImagePreview = { src: string; name: string };

const emptyValues: ProductFormValues = {
  code: "",
  name: "",
  categoryId: "",
  brandId: "",
  price: "",
  productUnit: "",
  stockAlert: "0",
  orderTax: "0",
  taxType: "Exclusive",
  quantityLimitation: "",
  notes: "",
  warehouseId: "",
  supplierId: "",
  quantity: "0",
  status: "Received",
};

export default function ProductForm({
  mode,
  action,
  initialValues,
  categories,
  brands,
  units,
  warehouses,
  suppliers,
  images = [],
}: {
  mode: "create" | "edit";
  action: ProductFormAction;
  initialValues?: Partial<ProductFormValues>;
  categories: ProductOption[];
  brands: ProductOption[];
  units: ProductOption[];
  warehouses?: ProductOption[];
  suppliers?: ProductOption[];
  images?: string[];
}) {
  const router = useRouter();
  const imageInput = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState<ProductActionState, FormData>(
    action,
    initialProductActionState,
  );
  const { formRef, retainValues } = useRetainedFormValues(state, state.status === "error");
  const values = { ...emptyValues, ...initialValues };
  const [formValues, setFormValues] = useState<Record<ProductField, string>>(() => values);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<ProductImagePreview[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const currentImages = images.filter((image) => !removedImages.includes(image));

  function updateFormValue(field: ProductField, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    if (state.status === "success") {
      router.push("/products?updated=1");
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
  }, [router, state]);

  useEffect(() => () => {
    newImages.forEach((image) => URL.revokeObjectURL(image.src));
  }, [newImages]);

  function fieldError(field: ProductField | "images") {
    return state.fieldErrors?.[field]?.[0];
  }

  function updateNewImages(files: FileList | null) {
    newImages.forEach((image) => URL.revokeObjectURL(image.src));
    setNewImages(Array.from(files ?? []).map((file) => ({
      src: URL.createObjectURL(file),
      name: file.name,
    })));
  }

  function removeNewImage(index: number) {
    const input = imageInput.current;
    if (!input?.files) return;
    const files = Array.from(input.files);
    const nextFiles = files.filter((_, fileIndex) => fileIndex !== index);
    const dataTransfer = new DataTransfer();
    nextFiles.forEach((file) => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
    updateNewImages(input.files);
  }

  return (
    <main className="gg-content">
      <div className="page-head">
        <h1 className="gg-page-title">{mode === "create" ? "Create Product" : "Edit Product"}</h1>
        <Link className="gg-btn gg-btn--secondary" href="/products">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
      </div>

      <form ref={formRef} onSubmit={retainValues} className="gg-card gg-card-pad product-form-card" action={formAction} noValidate>
        {removedImages.map((image) => (
          <input key={image} type="hidden" name="removeImage" value={image} />
        ))}
        <div className="create-layout">
          <div className="field-grid">
            <FormInput
              name="name"
              label="Name"
              required
              value={formValues.name}
              onChange={(value) => updateFormValue("name", value)}
              error={fieldError("name")}
              pending={isPending}
              placeholder="Enter Name"
            />
            <FormInput
              name="code"
              label="Code"
              required
              value={formValues.code}
              onChange={(value) => updateFormValue("code", value)}
              error={fieldError("code")}
              pending={isPending}
              placeholder="Enter Code"
            />
            <FormSelect
              name="categoryId"
              label="Product Category"
              required
              value={formValues.categoryId}
              onChange={(value) => updateFormValue("categoryId", value)}
              options={categories}
              placeholder="Choose Product Category"
              error={fieldError("categoryId")}
              pending={isPending}
            />
            <FormSelect
              name="brandId"
              label="Brand"
              required
              value={formValues.brandId}
              onChange={(value) => updateFormValue("brandId", value)}
              options={brands}
              placeholder="Choose Brand"
              error={fieldError("brandId")}
              pending={isPending}
            />
            <FormInput
              name="price"
              label="Product Price"
              required
              value={formValues.price}
              onChange={(value) => updateFormValue("price", value)}
              error={fieldError("price")}
              pending={isPending}
              placeholder="Enter Product Price"
              type="number"
              step="0.01"
              prefix="$"
            />
            <FormSelect
              name="productUnit"
              label="Product Unit"
              required
              value={formValues.productUnit}
              onChange={(value) => updateFormValue("productUnit", value)}
              options={units}
              placeholder="Choose Unit"
              error={fieldError("productUnit")}
              pending={isPending}
            />
            <FormInput
              name="stockAlert"
              label="Stock Alert"
              value={formValues.stockAlert}
              onChange={(value) => updateFormValue("stockAlert", value)}
              error={fieldError("stockAlert")}
              pending={isPending}
              placeholder="0"
              type="number"
              step="0.001"
            />
            <FormInput
              name="orderTax"
              label="Order Tax"
              value={formValues.orderTax}
              onChange={(value) => updateFormValue("orderTax", value)}
              error={fieldError("orderTax")}
              pending={isPending}
              placeholder="0"
              type="number"
              step="0.01"
              suffix="%"
            />
            <FormSelect
              name="taxType"
              label="Tax Type"
              required
              value={formValues.taxType}
              onChange={(value) => updateFormValue("taxType", value)}
              options={[
                { id: "Exclusive", name: "Exclusive" },
                { id: "Inclusive", name: "Inclusive" },
              ]}
              error={fieldError("taxType")}
              pending={isPending}
            />
            <FormInput
              name="quantityLimitation"
              label="Quantity Limitation"
              value={formValues.quantityLimitation}
              onChange={(value) => updateFormValue("quantityLimitation", value)}
              error={fieldError("quantityLimitation")}
              pending={isPending}
              placeholder="Enter Quantity Limitation"
              type="number"
              step="0.001"
            />
            <div className="gg-field span-2">
              <label className="gg-label" htmlFor="notes">Notes</label>
              <textarea
                className="gg-input"
                id="notes"
                name="notes"
                rows={4}
                maxLength={5000}
                placeholder="Enter Notes"
                value={formValues.notes}
                onChange={(event) => updateFormValue("notes", event.target.value)}
                aria-invalid={Boolean(fieldError("notes"))}
                disabled={isPending}
              />
              {fieldError("notes") && <span className="warehouse-field-error">{fieldError("notes")}</span>}
            </div>

            <div className="span-2 gg-form-actions product-form-actions">
              <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
                <Check aria-hidden="true" />
                {isPending ? (mode === "create" ? "Saving..." : "Updating...") : (mode === "create" ? "Save" : "Update")}
              </button>
              <Link className="gg-btn gg-btn--secondary" href="/products" aria-disabled={isPending}>
                Cancel
              </Link>
            </div>
          </div>

          <aside className="stock-rail">
            <div className="gg-field">
              <label className="gg-label" htmlFor="product-images">Multiple Image</label>
              <label className="product-image-picker" htmlFor="product-images">
                <ImagePlus aria-hidden="true" />
                <span>Choose product images</span>
                <span className="gg-caption">PNG, JPEG, or WebP; up to 10 files</span>
              </label>
              <input
                ref={imageInput}
                className="sr-only"
                id="product-images"
                name="images"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={isPending}
                onChange={(event) => updateNewImages(event.target.files)}
              />
              {fieldError("images") && <span className="warehouse-field-error">{fieldError("images")}</span>}
              <div className="product-image-grid">
                {currentImages.map((image) => (
                  <div className="product-image-preview" key={image}>
                    <img src={image} alt="Product image" />
                    {mode === "edit" && (
                      <button
                        type="button"
                        aria-label="Remove product image"
                        onClick={() => setRemovedImages((removed) => [...removed, image])}
                        disabled={isPending}
                      >
                        <X aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                {newImages.map((image, index) => (
                  <div className="product-image-preview" key={`${image.name}-${index}`}>
                    <img src={image.src} alt={image.name} />
                    <button
                      type="button"
                      aria-label={`Remove ${image.name}`}
                      onClick={() => removeNewImage(index)}
                      disabled={isPending}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {mode === "create" ? (
              <>
                <h2 className="gg-form-section-title">Add Stock</h2>
                <FormSelect
                  name="warehouseId"
                  label="Warehouse"
                  required
                  value={formValues.warehouseId}
                  onChange={(value) => updateFormValue("warehouseId", value)}
                  options={warehouses ?? []}
                  placeholder="Choose Warehouse"
                  error={fieldError("warehouseId")}
                  pending={isPending}
                />
                <FormSelect
                  name="supplierId"
                  label="Supplier"
                  required
                  value={formValues.supplierId}
                  onChange={(value) => updateFormValue("supplierId", value)}
                  options={suppliers ?? []}
                  placeholder="Choose Supplier"
                  error={fieldError("supplierId")}
                  pending={isPending}
                />
                <FormInput
                  name="quantity"
                  label="Add Product Quantity"
                  required
                  value={formValues.quantity}
                  onChange={(value) => updateFormValue("quantity", value)}
                  error={fieldError("quantity")}
                  pending={isPending}
                  placeholder="Add Product Quantity"
                  type="number"
                  step="0.001"
                />
                <FormSelect
                  name="status"
                  label="Status"
                  required
                  value={formValues.status}
                  onChange={(value) => updateFormValue("status", value)}
                  options={[
                    { id: "Received", name: "Received" },
                    { id: "Pending", name: "Pending" },
                    { id: "Ordered", name: "Ordered" },
                  ]}
                  error={fieldError("status")}
                  pending={isPending}
                />
              </>
            ) : (
              <div className="product-stock-edit-note">
                Stock is managed separately. Saving product details will not add stock again.
              </div>
            )}
          </aside>
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

function FormInput({
  name,
  label,
  required,
  value,
  onChange,
  error,
  pending,
  placeholder,
  type = "text",
  step,
  prefix,
  suffix,
}: {
  name: ProductField;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  pending: boolean;
  placeholder: string;
  type?: string;
  step?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="gg-field">
      <label className="gg-label" htmlFor={name}>
        {label}{required && <> <span className="gg-req">*</span></>}
      </label>
      <div className={prefix || suffix ? "gg-input-group" : undefined}>
        {prefix && <span className="gg-input-prefix">{prefix}</span>}
        <input
          className="gg-input"
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          step={step}
          min={type === "number" ? "0" : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          disabled={pending}
        />
        {suffix && <span className="gg-input-suffix">{suffix}</span>}
      </div>
      {error && <span className="warehouse-field-error" id={`${name}-error`}>{error}</span>}
    </div>
  );
}

function FormSelect({
  name,
  label,
  required,
  value,
  onChange,
  options,
  placeholder,
  error,
  pending,
}: {
  name: ProductField;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: ProductOption[];
  placeholder?: string;
  error?: string;
  pending: boolean;
}) {
  return (
    <div className="gg-field">
      <label className="gg-label" htmlFor={name}>
        {label}{required && <> <span className="gg-req">*</span></>}
      </label>
      <select
        className="gg-select"
        id={name}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        disabled={pending}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.id} value={option.value ?? option.id}>{option.name}</option>
        ))}
      </select>
      {error && <span className="warehouse-field-error" id={`${name}-error`}>{error}</span>}
    </div>
  );
}
