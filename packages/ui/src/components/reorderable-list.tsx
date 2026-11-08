"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type KeyboardEvent, type ReactNode, useCallback, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";

export interface ReorderableItem {
  id: string;
}

export interface ReorderableListProps<T extends ReorderableItem> {
  items: T[];
  /** Nouvel ordre complet des identifiants, appelé une fois le déplacement validé. */
  onReorder: (ids: string[]) => void;
  /** Contenu de la ligne, à droite de la poignée. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Nom de la poignée (« Déplacer 05 · Périmètre »). */
  handleLabel: (item: T, index: number) => string;
  /** Texte d'annonce après un déplacement (« Périmètre déplacée en position 4 sur 11 »). */
  announce: (item: T, position: number, total: number) => string;
  /** Lecture seule : ni poignée ni déplacement. */
  readOnly?: boolean;
  /** Ligne mise en avant par un contour discret (page neuve). */
  highlight?: (item: T) => boolean;
  className?: string;
}

const START_KEYS = ["Space"];
const END_KEYS = ["Space"];
const CANCEL_KEYS = ["Escape"];

const ACCESSIBILITY = {
  // Les annonces sont écrites par la liste (`aria-live="polite"`) : celles de la bibliothèque restent muettes.
  announcements: {
    onDragStart: () => undefined,
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
  },
  screenReaderInstructions: {
    draggable:
      "Espace pour saisir la page, flèches pour la déplacer, Espace pour la déposer, Échap pour annuler.",
  },
};

const reducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Row<T extends ReorderableItem>({
  item,
  index,
  total,
  props,
  move,
}: {
  item: T;
  index: number;
  total: number;
  props: ReorderableListProps<T>;
  move: (from: number, to: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: props.readOnly });
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const target = index + (event.key === "ArrowUp" ? -1 : 1);
      if (target >= 0 && target < total) move(index, target);
      return;
    }
    listeners?.onKeyDown?.(event);
  };
  return (
    <li
      ref={setNodeRef}
      data-slot="reorderable-item"
      data-dragging={isDragging || undefined}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: reducedMotion() ? undefined : transition,
      }}
      className={cn(
        "relative flex items-center rounded-md bg-background/0",
        isDragging && "z-10 bg-background shadow-md",
        props.highlight?.(item) && "ring-1 ring-border ring-inset",
      )}
    >
      {props.readOnly ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              onKeyDown={onKeyDown}
              aria-label={props.handleLabel(item, index)}
              className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-border-strong hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="drag_indicator" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Glisser, ou Alt + flèches</TooltipContent>
        </Tooltip>
      )}
      {props.renderItem(item, index)}
    </li>
  );
}

function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: START_KEYS, end: END_KEYS, cancel: CANCEL_KEYS },
    }),
  );
}

/**
 * Liste réordonnable (DESIGN.md §5.8, ADR 0020) : `ol` de lignes à poignée `drag_indicator`. Clavier : Espace saisit, flèches
 * déplacent, Espace dépose, Échap annule ; Alt + flèche haut ou bas déplace d'un cran depuis la poignée. Chaque
 * déplacement est annoncé en `aria-live="polite"`. Aucune animation si l'utilisateur la réduit.
 */
export function ReorderableList<T extends ReorderableItem>(props: ReorderableListProps<T>) {
  const { items, onReorder, announce, className } = props;
  const [message, setMessage] = useState("");
  const sensors = useReorderSensors();
  const move = useCallback(
    (from: number, to: number) => {
      const moved = items[from];
      if (!moved || from === to) return;
      onReorder(arrayMove(items, from, to).map((item) => item.id));
      setMessage(announce(moved, to + 1, items.length));
    },
    [items, onReorder, announce],
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      items.findIndex((item) => item.id === active.id),
      items.findIndex((item) => item.id === over.id),
    );
  };
  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={ACCESSIBILITY}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol
            data-slot="reorderable-list"
            className={cn("m-0 flex list-none flex-col gap-0.5 p-0", className)}
          >
            {items.map((item, index) => (
              <Row
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                props={props}
                move={move}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <p aria-live="polite" aria-atomic="true" data-slot="reorder-announcer" className="sr-only">
        {message}
      </p>
    </TooltipProvider>
  );
}
