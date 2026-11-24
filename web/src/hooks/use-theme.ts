import { useCallback, useEffect, useState } from "react";

const KEY = "dashboard-theme";
type Mode = "light" | "dark";

export function useTheme(initial: "light" | "dark" | "system") {
  const [mode, setMode] = useState<Mode>("light");
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    const sys = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setMode(saved === "dark" || saved === "light" ? saved : initial === "system" ? sys : initial);
  }, [initial]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);
  const toggle = useCallback(() => {
    setMode((m) => {
      const n = m === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, n);
      return n;
    });
  }, []);
  return { mode, toggle };
}
