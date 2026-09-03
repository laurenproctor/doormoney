"use client";
import { useLayoutEffect } from "react";

/** Copies the page theme onto <html>, so the cookie notice and the browser chrome take the page's colour. */
export function ThemeSync({ name }: { name: string }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = name;
    return () => {
      if (root.dataset.theme === name) delete root.dataset.theme;
    };
  }, [name]);
  return null;
}
