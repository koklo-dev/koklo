import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { type Editor, Extension } from "@tiptap/react";

/** Emplacement d'une proposition : `blockIndex` est le rang du bloc de premier niveau sous lequel elle s'insère. */
export interface ProposalSlot {
  id: string;
  blockIndex: number;
}

export interface SlotHost {
  mount: (id: string, element: HTMLElement) => void;
  unmount: (id: string, element: HTMLElement) => void;
}

const key = new PluginKey<ProposalSlot[]>("ideaProposalSlots");

function widget(slot: ProposalSlot, host: SlotHost) {
  return (): HTMLElement => {
    const element = document.createElement("div");
    element.dataset.proposalSlot = slot.id;
    element.setAttribute("contenteditable", "false");
    element.className = "my-[18px]";
    host.mount(slot.id, element);
    return element;
  };
}

/**
 * Propositions de l'agent à l'endroit exact (fiche TK-90 §5) : un widget ProseMirror non éditable après le bloc
 * d'ancre, dans lequel React rend la proposition par un portail. Le widget n'entre jamais dans le Markdown
 * enregistré : seul le document de l'éditeur est sérialisé.
 */
export function proposalSlotsExtension(host: SlotHost) {
  return Extension.create({
    name: "ideaProposalSlots",
    addProseMirrorPlugins() {
      return [
        new Plugin<ProposalSlot[]>({
          key,
          state: { init: () => [], apply: (tr, value) => tr.getMeta(key) ?? value },
          props: {
            decorations(state) {
              const slots = key.getState(state) ?? [];
              if (slots.length === 0) return DecorationSet.empty;
              const ends: number[] = [];
              state.doc.forEach((node, offset) => {
                ends.push(offset + node.nodeSize);
              });
              return DecorationSet.create(
                state.doc,
                slots.map((slot) =>
                  Decoration.widget(
                    ends[Math.min(slot.blockIndex, ends.length - 1)] ?? state.doc.content.size,
                    widget(slot, host),
                    {
                      key: slot.id,
                      side: 1,
                      stopEvent: () => true,
                      ignoreSelection: true,
                      destroy: (node) => host.unmount(slot.id, node as HTMLElement),
                    },
                  ),
                ),
              );
            },
          },
        }),
      ];
    },
  });
}

/** Pose les emplacements dans l'éditeur (les propositions changent, l'éditeur reste). */
export function setProposalSlots(editor: Editor, slots: ProposalSlot[]): void {
  const current = key.getState(editor.state) ?? [];
  if (JSON.stringify(current) === JSON.stringify(slots)) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, slots));
}
