"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function UserMenu({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <div className="gg-user-menu" ref={menuRef}>
      <button
        className="gg-user"
        type="button"
        aria-label={`Account menu for ${name}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? "account-menu" : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="gg-avatar">
          {image ? <Image src={image} alt="" width={32} height={32} unoptimized /> : initial}
        </span>
        <span className="gg-user-name">{name}</span>
        <ChevronDown className="gg-user-chevron" aria-hidden="true" size={16} />
      </button>
      {isOpen && (
        <div className="gg-menu gg-user-dropdown" id="account-menu" role="menu" aria-label="Account">
          <Link className="gg-menu-item" href="/profile" role="menuitem" onClick={closeMenu}>
            <UserRound aria-hidden="true" />
            Profile
          </Link>
          <Link className="gg-menu-item" href="/change-password" role="menuitem" onClick={closeMenu}>
            <KeyRound aria-hidden="true" />
            Change Password
          </Link>
          <button
            className="gg-menu-item is-danger"
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              void signOut({ redirectTo: "/" });
            }}
          >
            <LogOut aria-hidden="true" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
