"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Info,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type {
  MasterDataAction,
  MasterDataActionState,
  MasterDataItem,
} from "@/app/master-data/action-state";
import AutoSearchForm from "@/components/shared/AutoSearchForm";

type MasterDataManagerProps = {
  entity: "Product Category" | "Brand" | "Expense Category";
  listPath: string;
  query: string;
  pageSize: number;
  items: MasterDataItem[];
  pagination: ReactNode;
  createAction?: MasterDataAction;
  updateAction?: MasterDataAction;
  deleteAction?: MasterDataAction;
};

type EditorState = { mode: "create" } | { mode: "edit"; item: MasterDataItem };

export default function MasterDataManager({
  entity,
  listPath,
  query,
  pageSize,
  items,
  pagination,
  createAction,
  updateAction,
  deleteAction,
}: MasterDataManagerProps) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MasterDataItem | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<MasterDataActionState["fieldErrors"]>();
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editorFormRef = useRef<HTMLFormElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!editor) return;
    setPreview(editor.mode === "edit" ? editor.item.logo : null);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) closeEditor();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor, isPending]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (deleteTarget && dialog && !dialog.open) dialog.showModal();
  }, [deleteTarget]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 5300);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function closeEditor(force = false) {
    if (isPending && !force) return;
    setEditor(null);
    setFieldErrors(undefined);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    window.setTimeout(() => restoreFocusRef.current?.focus(), 0);
  }

  function openEditor(nextEditor: EditorState, trigger: HTMLElement) {
    restoreFocusRef.current = trigger;
    setMessage("");
    setEditor(nextEditor);
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(objectUrlRef.current ?? (editor?.mode === "edit" ? editor.item.logo : null));
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || isPending) return;

    setFieldErrors(undefined);
    const formData = new FormData(event.currentTarget);
    if (editor.mode === "edit") formData.set("id", editor.item.id);
    const action = editor.mode === "create" ? createAction : updateAction;
    if (!action) return;

    startTransition(async () => {
      const result = await action(formData);
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        setIsError(true);
        return;
      }

      closeEditor(true);
      setMessage(result.message);
      setIsError(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteTarget || !deleteAction || isPending) return;
    const formData = new FormData();
    formData.set("id", deleteTarget.id);
    startTransition(async () => {
      const result = await deleteAction(formData);
      deleteDialogRef.current?.close();
      setDeleteTarget(null);
      setMessage(result.message);
      setIsError(result.status === "error");
      if (result.status === "success") router.refresh();
    });
  }

  const editorTitle = editor?.mode === "edit" ? `Edit ${entity}` : `Create ${entity}`;
  const hasLogo = entity !== "Expense Category";
  const pluralEntity = entity === "Product Category"
    ? "Product Categories"
    : entity === "Brand"
      ? "Brands"
      : "Expense Categories";

  return (
    <>
      {message && (
        <p className={`warehouse-toast${isError ? "" : " warehouse-toast-success"} is-visible`} role={isError ? "alert" : "status"}>
          {isError ? <Info size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          <span>{message}</span>
          <button className="master-data-toast-close" type="button" aria-label="Dismiss message" onClick={() => setMessage("")}>
            <X size={16} aria-hidden="true" />
          </button>
        </p>
      )}

      <div className="gg-table-toolbar">
        <AutoSearchForm
          action={listPath}
          className="warehouse-search-form"
          iconClassName="gg-input-icon warehouse-search-control"
          id={`${listPath}-search`}
          label={`Search ${pluralEntity.toLowerCase()}`}
          value={query}
        />
        <div className="gg-spacer" />
        <button
          className="gg-btn gg-btn--primary"
          type="button"
          onClick={(event) => openEditor({ mode: "create" }, event.currentTarget)}
        >
          <Plus aria-hidden="true" />
          Create {entity}
        </button>
      </div>

      <div className="gg-card gg-card-pad master-data-table-card">
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th scope="col">{entity === "Expense Category" ? "Name" : entity}</th>
                <th scope="col" className="category-actions-heading">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {hasLogo ? (
                      <div className="category-list-cell">
                        <span className="cat-thumb" aria-hidden="true">
                          {item.logo ? (
                            <Image src={item.logo} alt="" fill unoptimized sizes="42px" />
                          ) : (
                            <ImageIcon aria-hidden="true" />
                          )}
                        </span>
                        <strong>{item.name}</strong>
                      </div>
                    ) : (
                      <span className="gg-td-strong">{item.name}</span>
                    )}
                  </td>
                  <td className="category-actions-cell">
                    <div className="row-acts">
                      <button
                        className="act-edit"
                        type="button"
                        aria-label={`Edit ${item.name}`}
                        title="Edit"
                        onClick={(event) => openEditor({ mode: "edit", item }, event.currentTarget)}
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        className="act-del"
                        type="button"
                        aria-label={`Delete ${item.name}`}
                        title="Delete"
                        disabled={!deleteAction}
                        onClick={() => {
                          setMessage("");
                          setDeleteTarget(item);
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="category-empty-cell" colSpan={2}>
                    <p className="warehouse-empty-title">
                      {query ? `No ${pluralEntity.toLowerCase()} match your search` : `No ${pluralEntity.toLowerCase()} yet`}
                    </p>
                    <p className="gg-muted">
                      {query
                        ? `Try another ${entity.toLowerCase()} name.`
                        : entity === "Expense Category"
                          ? "Create an expense category to organize expenses."
                          : `Create a ${entity.toLowerCase()} to organize your inventory.`}
                    </p>
                    {!query && (
                      <button
                        className="gg-btn gg-btn--primary"
                        type="button"
                        onClick={(event) => openEditor({ mode: "create" }, event.currentTarget)}
                      >
                        <Plus aria-hidden="true" />
                        Create {entity}
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pagination}
      </div>

      {editor && (
        <div
          className="gg-overlay is-open"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <form
            ref={editorFormRef}
            className="gg-modal master-data-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-data-modal-title"
            onSubmit={handleSave}
          >
            <div className="gg-modal-head">
              <h2 className="gg-card-title" id="master-data-modal-title">{editorTitle}</h2>
              <button
                className="gg-modal-close"
                type="button"
                aria-label="Close"
                onClick={() => closeEditor()}
                disabled={isPending}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="gg-modal-body">
              <div className="gg-field">
                <label className="gg-label" htmlFor="master-data-name">
                  Name <span className="gg-req">*</span>
                </label>
                <input
                  className="gg-input"
                  id="master-data-name"
                  name="name"
                  placeholder="Enter Name"
                  defaultValue={editor.mode === "edit" ? editor.item.name : ""}
                  maxLength={191}
                  required
                  autoFocus
                  aria-invalid={Boolean(fieldErrors?.name?.[0])}
                  aria-describedby={fieldErrors?.name?.[0] ? "master-data-name-error" : undefined}
                  disabled={isPending}
                />
                {fieldErrors?.name?.[0] && (
                  <span className="profile-field-error" id="master-data-name-error">{fieldErrors.name[0]}</span>
                )}
              </div>

              {hasLogo && <div className="gg-field">
                <label className="gg-label" htmlFor="master-data-logo">Change Logo</label>
                <div className="logo-drop">
                  {preview ? (
                    <Image src={preview} alt="Logo preview" fill unoptimized sizes="116px" />
                  ) : (
                    <ImageIcon className="ph" aria-hidden="true" />
                  )}
                  <label className="logo-edit" htmlFor="master-data-logo" title="Choose logo">
                    <Pencil aria-hidden="true" />
                  </label>
                  <input
                    className="profile-file-input"
                    id="master-data-logo"
                    name="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    ref={logoInputRef}
                    onChange={handleLogoChange}
                    disabled={isPending}
                    aria-describedby={fieldErrors?.logo?.[0] ? "master-data-logo-error" : "master-data-logo-hint"}
                  />
                </div>
                <span className="gg-caption" id="master-data-logo-hint">PNG, JPEG, or WebP. Maximum file size: 2 MB.</span>
                {fieldErrors?.logo?.[0] && (
                  <span className="profile-field-error" id="master-data-logo-error">{fieldErrors.logo[0]}</span>
                )}
              </div>}
              {message && isError && <p className="profile-alert" role="alert">{message}</p>}
            </div>
            <div className="gg-modal-foot">
              <button
                className="gg-btn gg-btn--primary"
                type="submit"
                disabled={isPending || !(editor.mode === "create" ? createAction : updateAction)}
                title={!(editor.mode === "create" ? createAction : updateAction) ? "Saving will be available in the next step." : undefined}
              >
                <Check aria-hidden="true" />
                {isPending ? "Saving..." : "Save"}
              </button>
              <button className="gg-btn gg-btn--secondary" type="button" onClick={() => closeEditor()} disabled={isPending}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <dialog
        className="gg-modal warehouse-confirm-dialog"
        ref={deleteDialogRef}
        aria-labelledby="master-data-delete-title"
        aria-describedby="master-data-delete-description"
        onClose={() => setDeleteTarget(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) deleteDialogRef.current?.close();
        }}
      >
        <div className="gg-modal-head">
          <span className="warehouse-confirm-icon"><AlertTriangle aria-hidden="true" /></span>
          <h2 className="gg-card-title" id="master-data-delete-title">Delete {entity.toLowerCase()}?</h2>
        </div>
        <div className="gg-modal-body">
          <p id="master-data-delete-description">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This item will be removed from
            active lists.
          </p>
        </div>
        <div className="gg-modal-foot">
          <button className="gg-btn gg-btn--secondary" type="button" onClick={() => deleteDialogRef.current?.close()} disabled={isPending}>
            Cancel
          </button>
          <button className="gg-btn gg-btn--danger" type="button" onClick={handleDelete} disabled={isPending}>
            <Trash2 aria-hidden="true" />
            {isPending ? "Deleting..." : `Delete ${entity}`}
          </button>
        </div>
      </dialog>
    </>
  );
}
