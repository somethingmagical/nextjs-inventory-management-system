"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ImagePlus, Info, Plus, X } from "lucide-react";
import {
  initialProductActionState,
  type ProductActionState,
  type ProductField,
} from "./action-state";
import type { ProductFormValues } from "../product-schema";
import { MAX_PRODUCT_PRICE } from "@/lib/product-price";
import { useRetainedFormValues } from "@/components/shared/useRetainedFormValues";
import ProductReferenceCreateDialog, { type ProductReferenceKind } from "@/components/master-data/ProductReferenceCreateDialog";

type ProductFormAction = (
  state: ProductActionState,
  formData: FormData,
) => Promise<ProductActionState>;

type ProductOption = { id: string; name: string; value?: string };
type ProductImagePreview = { id: string; src: string; name: string; file: File };
type OrderedProductImage =
  | { key: string; path: string; preview: null }
  | { key: string; path: null; preview: ProductImagePreview };

function existingImageKey(path: string) {
  return `existing:${path}`;
}

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
  canCreateCategory,
  canCreateBrand,
  canCreateSupplier,
  canCreateWarehouse,
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
  canCreateCategory: boolean;
  canCreateBrand: boolean;
  canCreateSupplier: boolean;
  canCreateWarehouse: boolean;
  brands: ProductOption[];
  units: ProductOption[];
  warehouses?: ProductOption[];
  suppliers?: ProductOption[];
  images?: string[];
}) {
  const router = useRouter();
  const imageInput = useRef<HTMLInputElement>(null);
  const newImagesRef = useRef<ProductImagePreview[]>([]);
  const categoryAddButtonRef = useRef<HTMLButtonElement>(null);
  const brandAddButtonRef = useRef<HTMLButtonElement>(null);
  const supplierAddButtonRef = useRef<HTMLButtonElement>(null);
  const warehouseAddButtonRef = useRef<HTMLButtonElement>(null);
  const [activeQuickCreate, setActiveQuickCreate] = useState<ProductReferenceKind | null>(null);
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [brandOptions, setBrandOptions] = useState(brands);
  const [supplierOptions, setSupplierOptions] = useState(suppliers ?? []);
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses ?? []);
  const [state, formAction, isPending] = useActionState<ProductActionState, FormData>(
    action,
    initialProductActionState,
  );
  const { formRef, retainValues } = useRetainedFormValues(state, state.status === "error");
  const values = { ...emptyValues, ...initialValues };
  const [formValues, setFormValues] = useState<Record<ProductField, string>>(() => values);
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<ProductImagePreview[]>([]);
  const [imageOrder, setImageOrder] = useState<string[] | null>(null);
  const [imageSelectionError, setImageSelectionError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const currentImages = images.filter((image) => !removedImages.includes(image));
  const orderedImageKeys = imageOrder ?? [
    ...currentImages.map(existingImageKey),
    ...newImages.map((image) => image.id),
  ];
  const orderedImages = orderedImageKeys.flatMap<OrderedProductImage>((key) => {
    if (key.startsWith("existing:")) {
      const path = key.slice("existing:".length);
      return currentImages.includes(path) ? [{ key, path, preview: null }] : [];
    }

    const preview = newImages.find((image) => image.id === key);
    return preview ? [{ key, path: null, preview }] : [];
  });

  function updateFormValue(field: ProductField, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function closeQuickCreate() {
    const trigger = {
      category: categoryAddButtonRef,
      brand: brandAddButtonRef,
      supplier: supplierAddButtonRef,
      warehouse: warehouseAddButtonRef,
    }[activeQuickCreate ?? "category"];
    setActiveQuickCreate(null);
    window.setTimeout(() => trigger.current?.focus(), 0);
  }

  function handleReferenceCreated(kind: ProductReferenceKind, reference: ProductOption) {
    if (kind === "category") {
      setCategoryOptions((current) => [...current, reference]);
      updateFormValue("categoryId", reference.id);
    } else if (kind === "brand") {
      setBrandOptions((current) => [...current, reference]);
      updateFormValue("brandId", reference.id);
    } else if (kind === "supplier") {
      setSupplierOptions((current) => [...current, reference]);
      updateFormValue("supplierId", reference.id);
    } else {
      setWarehouseOptions((current) => [...current, reference]);
      updateFormValue("warehouseId", reference.id);
    }
    router.refresh();
  }

  useEffect(() => {
    if (state.status === "idle") {
      setShowToast(false);
      setToastVisible(false);
      return;
    }

    if (state.status === "success") {
      newImagesRef.current.forEach((image) => URL.revokeObjectURL(image.src));
      newImagesRef.current = [];
      setNewImages([]);
      setRemovedImages([]);
      setImageOrder(null);
      setImageSelectionError(null);
      if (imageInput.current) imageInput.current.value = "";
      router.refresh();
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
    newImagesRef.current.forEach((image) => URL.revokeObjectURL(image.src));
  }, []);

  function fieldError(field: ProductField | "images") {
    return state.fieldErrors?.[field]?.[0];
  }

  function updateNewImages(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []).filter((file) => file.size > 0);
    const currentNewImages = newImagesRef.current;
    const remainingSlots = Math.max(0, 10 - currentImages.length - currentNewImages.length);
    const acceptedFiles = selectedFiles.slice(0, remainingSlots);
    const addedImages = acceptedFiles.map((file) => ({
      id: `new:${crypto.randomUUID()}`,
      src: URL.createObjectURL(file),
      name: file.name,
      file,
    }));
    const nextImages = [
      ...currentNewImages,
      ...addedImages,
    ];

    setImageSelectionError(
      acceptedFiles.length < selectedFiles.length
        ? "A product can have up to 10 images. Remove an image before adding more."
        : null,
    );

    const input = imageInput.current;
    if (input) {
      const dataTransfer = new DataTransfer();
      nextImages.forEach(({ file }) => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
    }

    newImagesRef.current = nextImages;
    setNewImages(nextImages);
    setImageOrder([
      ...orderedImageKeys,
      ...addedImages.map((image) => image.id),
    ]);
  }

  function removeNewImage(index: number) {
    const nextImages = newImages.filter((_, imageIndex) => imageIndex !== index);
    const removedImage = newImages[index];
    if (removedImage) URL.revokeObjectURL(removedImage.src);

    const input = imageInput.current;
    if (input) {
      const dataTransfer = new DataTransfer();
      nextImages.forEach(({ file }) => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
    }

    newImagesRef.current = nextImages;
    setNewImages(nextImages);
    setImageOrder(orderedImageKeys.filter((key) => key !== newImages[index]?.id));
    setImageSelectionError(null);
  }

  function applyImageOrder(nextOrder: string[]) {
    const previewsById = new Map(newImagesRef.current.map((image) => [image.id, image]));
    const nextImages = nextOrder.flatMap((key) => {
      const image = previewsById.get(key);
      return image ? [image] : [];
    });
    const input = imageInput.current;
    if (input) {
      const dataTransfer = new DataTransfer();
      nextImages.forEach(({ file }) => dataTransfer.items.add(file));
      input.files = dataTransfer.files;
    }
    newImagesRef.current = nextImages;
    setNewImages(nextImages);
    setImageOrder(nextOrder);
  }

  function moveImage(imageKey: string, offset: -1 | 1) {
    const index = orderedImageKeys.indexOf(imageKey);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedImageKeys.length) return;
    const nextOrder = [...orderedImageKeys];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    applyImageOrder(nextOrder);
  }

  function dropImage(targetKey: string, draggedKey: string) {
    if (!draggedKey || draggedKey === targetKey) return;
    const targetIndex = orderedImageKeys.indexOf(targetKey);
    if (targetIndex < 0) return;
    const nextOrder = orderedImageKeys.filter((key) => key !== draggedKey);
    nextOrder.splice(targetIndex, 0, draggedKey);
    applyImageOrder(nextOrder);
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
        {orderedImageKeys.map((key) => (
          <input key={key} type="hidden" name="imageOrder" value={key} />
        ))}
        {newImages.map((image) => (
          <input key={image.id} type="hidden" name="newImageId" value={image.id} />
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
              options={categoryOptions}
              placeholder="Choose Product Category"
              error={fieldError("categoryId")}
              pending={isPending}
              actionAllowed={canCreateCategory}
              actionButtonRef={categoryAddButtonRef}
              onAction={() => setActiveQuickCreate("category")}
            />
            <FormSelect
              name="brandId"
              label="Brand"
              required
              value={formValues.brandId}
              onChange={(value) => updateFormValue("brandId", value)}
              options={brandOptions}
              placeholder="Choose Brand"
              error={fieldError("brandId")}
              pending={isPending}
              actionAllowed={canCreateBrand}
              actionButtonRef={brandAddButtonRef}
              onAction={() => setActiveQuickCreate("brand")}
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
              max={MAX_PRODUCT_PRICE}
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
                <span className="gg-caption">
                  PNG, JPEG, or WebP; up to {Math.max(0, 10 - currentImages.length)} more
                </span>
                <span className="gg-caption">Drag images to reorder; the first image is primary.</span>
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
              {(imageSelectionError || fieldError("images")) && (
                <span className="warehouse-field-error">
                  {imageSelectionError || fieldError("images")}
                </span>
              )}
              <div className="product-image-grid">
                {orderedImages.map(({ key, path, preview }, index) => (
                  <div
                    className="product-image-preview"
                    key={key}
                    draggable={!isPending}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", key);
                      event.dataTransfer.effectAllowed = "move";
                      event.currentTarget.classList.add("is-dragging");
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropImage(key, event.dataTransfer.getData("text/plain"));
                    }}
                    onDragEnd={(event) => {
                      event.currentTarget.classList.remove("is-dragging");
                    }}
                  >
                    <Image
                      src={preview?.src ?? path ?? ""}
                      alt={preview?.name ?? "Product image"}
                      width={120}
                      height={120}
                      unoptimized
                    />
                    {index === 0 && <span className="product-image-primary">Primary</span>}
                    <div className="product-image-actions">
                      <button
                        type="button"
                        aria-label={`Move ${preview?.name ?? "product image"} earlier`}
                        onClick={() => moveImage(key, -1)}
                        disabled={isPending || index === 0}
                      >
                        <ChevronLeft aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${preview?.name ?? "product image"} later`}
                        onClick={() => moveImage(key, 1)}
                        disabled={isPending || index === orderedImages.length - 1}
                      >
                        <ChevronRight aria-hidden="true" />
                      </button>
                      {preview ? (
                        <button
                          type="button"
                          aria-label={`Remove ${preview.name}`}
                          onClick={() => removeNewImage(newImages.findIndex((image) => image.id === preview.id))}
                          disabled={isPending}
                        >
                          <X aria-hidden="true" />
                        </button>
                      ) : mode === "edit" && path ? (
                        <button
                          type="button"
                          aria-label="Remove product image"
                          onClick={() => {
                            setRemovedImages((removed) => [...removed, path]);
                            setImageOrder(orderedImageKeys.filter((imageKey) => imageKey !== key));
                          }}
                          disabled={isPending}
                        >
                          <X aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
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
                  options={warehouseOptions}
                  placeholder="Choose Warehouse"
                  error={fieldError("warehouseId")}
                  pending={isPending}
                  actionAllowed={canCreateWarehouse}
                  actionButtonRef={warehouseAddButtonRef}
                  onAction={() => setActiveQuickCreate("warehouse")}
                />
                <FormSelect
                  name="supplierId"
                  label="Supplier"
                  required
                  value={formValues.supplierId}
                  onChange={(value) => updateFormValue("supplierId", value)}
                  options={supplierOptions}
                  placeholder="Choose Supplier"
                  error={fieldError("supplierId")}
                  pending={isPending}
                  actionAllowed={canCreateSupplier}
                  actionButtonRef={supplierAddButtonRef}
                  onAction={() => setActiveQuickCreate("supplier")}
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

      {state.status !== "idle" && showToast && (
        <p
          className={`warehouse-toast${state.status === "success" ? " warehouse-toast-success" : ""}${toastVisible ? " is-visible" : ""}`}
          role={state.status === "success" ? "status" : "alert"}
          aria-hidden={!toastVisible}
        >
          <Info size={18} aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      )}
      {activeQuickCreate && (
        <ProductReferenceCreateDialog
          kind={activeQuickCreate}
          onClose={closeQuickCreate}
          onCreated={(reference) => handleReferenceCreated(activeQuickCreate, reference)}
        />
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
  max,
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
  max?: string;
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
          max={max}
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
  actionAllowed,
  actionButtonRef,
  onAction,
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
  actionAllowed?: boolean;
  actionButtonRef?: RefObject<HTMLButtonElement | null>;
  onAction?: () => void;
}) {
  return (
    <div className="gg-field">
      <label className="gg-label" htmlFor={name}>
        {label}{required && <> <span className="gg-req">*</span></>}
      </label>
      <div className={actionAllowed && onAction ? "product-select-group" : undefined}>
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
        {actionAllowed && onAction && (
          <button
            ref={actionButtonRef}
            className="gg-btn gg-btn--secondary"
            type="button"
            aria-label={`Create ${label.toLocaleLowerCase()}`}
            title={`Create ${label.toLocaleLowerCase()}`}
            onClick={onAction}
            disabled={pending}
          >
            <Plus aria-hidden="true" />
          </button>
        )}
      </div>
      {error && <span className="warehouse-field-error" id={`${name}-error`}>{error}</span>}
    </div>
  );
}
