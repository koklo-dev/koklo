import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type ChatBubbleProps = Omit<ComponentProps<"div">, "children"> & {
  author: "agent" | "human";
  /** Auteur affiché au-dessus (12 px, atténué). */
  name?: string;
  children: ReactNode;
  /** Lien de contexte sous la bulle (`EntityChip`, lien vers la page). */
  context?: ReactNode;
};

/** Bulle du fil de l'agent (maquette 06) : agent à gauche (4 12 12 12), humain à droite (12 4 12 12). */
export function ChatBubble({
  author,
  name,
  children,
  context,
  className,
  ...props
}: ChatBubbleProps) {
  const human = author === "human";
  return (
    <div
      data-author={author}
      className={cn(
        "flex flex-col gap-1",
        human ? "items-end pl-6" : "items-start pr-6",
        className,
      )}
      {...props}
    >
      {name ? <span className="text-caption font-normal text-muted-foreground">{name}</span> : null}
      <div
        data-slot="chat-bubble"
        className={cn(
          "max-w-full whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-normal",
          human
            ? "rounded-[12px_4px_12px_12px] bg-secondary text-foreground"
            : "rounded-[4px_12px_12px_12px] border bg-background text-foreground",
        )}
      >
        {children}
      </div>
      {context}
    </div>
  );
}
