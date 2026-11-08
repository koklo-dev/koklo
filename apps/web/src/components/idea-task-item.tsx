"use client";

import { TaskCheckbox, taskItemClassName } from "@koklo/ui";
import { TaskItem } from "@tiptap/extension-task-item";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

/** Tâche de l'éditeur : la disposition et la case `TaskCheckbox` de `@koklo/ui` (maquette 06), dans la vue de nœud TipTap. */
function IdeaTaskItemView({ node, editor, updateAttributes }: NodeViewProps) {
  const checked = Boolean(node.attrs.checked);
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper data-type="taskItem" data-checked={checked} className={taskItemClassName}>
      <TaskCheckbox
        checked={checked}
        label={node.textContent.trim() || "Tâche sans texte"}
        contentEditable={false}
        disabled={!editable}
        onCheckedChange={(next) => updateAttributes({ checked: next })}
      />
      <NodeViewContent as="div" className="min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}

export const IdeaTaskItem = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(IdeaTaskItemView, { as: "li" });
  },
});
