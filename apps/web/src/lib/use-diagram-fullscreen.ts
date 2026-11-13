"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Plein écran du diagramme (B479) : l'onglet passe en calque fixe sur toute la fenêtre et le navigateur en plein écran
 * (au mieux : refusé, le calque reste). Le plein écran porte sur tout le document, pour que la fiche en panneau
 * (portail dans `body`) reste visible. Échap, ou la sortie du plein écran du navigateur, referme le calque ; une
 * fenêtre de dialogue ouverte garde son Échap.
 */
export function useDiagramFullscreen() {
  const [active, setActive] = useState(false);
  const exit = useCallback(() => {
    setActive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);
  const toggle = useCallback(() => {
    if (active) {
      exit();
      return;
    }
    setActive(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, [active, exit]);
  useEffect(() => {
    if (!active) return;
    const onChange = () => {
      if (!document.fullscreenElement) setActive(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[role='dialog'], [role='alertdialog']")) return;
      exit();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, exit]);
  return { active, onToggle: toggle };
}
