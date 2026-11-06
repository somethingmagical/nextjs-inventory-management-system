"use client";

import LoadingBar, { type LoadingBarRef } from "react-top-loading-bar";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export default function RouteLoadingBar() {
  const loadingBar = useRef<LoadingBarRef>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    loadingBar.current?.complete();
  }, [pathname, search]);

  useEffect(() => {
    function startForInternalNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) return;

      loadingBar.current?.continuousStart();
    }

    document.addEventListener("click", startForInternalNavigation, true);
    return () => document.removeEventListener("click", startForInternalNavigation, true);
  }, []);

  return (
    <LoadingBar
      ref={loadingBar}
      color="#c59d4f"
      height={3}
      shadow={false}
      containerStyle={{ position: "fixed", top: 0, left: 0, zIndex: 9999 }}
    />
  );
}
