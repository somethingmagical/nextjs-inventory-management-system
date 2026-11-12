"use client";

import { useId, useState, type ReactNode } from "react";
import { Filter } from "lucide-react";

export default function TableFilterPopover({
  children,
  label = "Filter table",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="table-filter-container">
      <button
        className="gg-icon-btn table-filter-button"
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Filter aria-hidden="true" />
      </button>
      <div className="table-filter-popover" id={panelId} hidden={!isOpen}>
        <div className="table-filter-controls">{children}</div>
      </div>
    </div>
  );
}
