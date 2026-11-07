"use client";

import { Toast as ToastPrimitive } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "../icons/icon.tsx";

export type ToastTone = "success" | "info" | "error";

export type ToastInput = {
  tone?: ToastTone;
  title: string;
  /** Action « OK » ou « Annuler » : appelle `onClick` puis ferme le toast. */
  action?: { label: string; onClick: () => void };
  /** Durée en ms ; défaut 5000, 8000 pour une erreur. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

const ICON: Record<ToastTone, IconName> = {
  success: "check_circle",
  info: "lightbulb",
  error: "error",
};

const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 8000;

function ToastCard({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const tone = item.tone ?? "success";
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      data-tone={tone}
      type={tone === "error" ? "foreground" : "background"}
      duration={item.duration ?? (tone === "error" ? ERROR_DURATION : DEFAULT_DURATION)}
      onOpenChange={(open) => open || onClose(item.id)}
      className="flex w-fit max-w-full items-center gap-2.5 rounded-card bg-foreground px-3.5 py-2.5 text-meta text-background shadow-toast motion-safe:data-[state=open]:animate-content-in"
    >
      <Icon name={ICON[tone]} size={18} />
      <ToastPrimitive.Title data-slot="toast-title" className="min-w-0">
        {item.title}
      </ToastPrimitive.Title>
      {item.action ? (
        <ToastPrimitive.Action
          altText={item.action.label}
          onClick={item.action.onClick}
          className="inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-meta font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
        >
          {item.action.label}
        </ToastPrimitive.Action>
      ) : null}
    </ToastPrimitive.Root>
  );
}

/** Fournisseur de toasts : file ordonnée, région « Notifications (F8) » en bas au centre. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const toast = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const id = nextId.current;
    setItems((current) => [...current, { ...input, id }]);
  }, []);
  const close = useCallback(
    (id: number) => setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="down">
        {children}
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onClose={close} />
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-6 left-1/2 z-[100] m-0 flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 list-none flex-col items-center gap-2 p-0 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast doit être appelé sous un ToastProvider.");
  return context;
}
