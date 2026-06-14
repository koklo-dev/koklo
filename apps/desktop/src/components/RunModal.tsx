import { useState } from "react";
import type { RunType } from "@koklo/trpc-client";
import { Modal, Input, Select, Button, type SessionPreset } from "@koklo/ui";
import { PRESETS, RUN_TYPES, type RunForm } from "../lib/sessionsModel";

const TYPE_LABELS: Record<RunType, string> = {
  feature: "Feature",
  bug: "Bug",
  task: "Task",
};

const PRESET_LABELS: Record<SessionPreset, string> = {
  light: "Light",
  sdd: "SDD",
  bmad: "BMAD",
  speckit: "SpecKit",
};

const TYPE_OPTIONS = RUN_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }));
const PRESET_OPTIONS = PRESETS.map((value) => ({ value, label: PRESET_LABELS[value] }));

export interface RunModalProps {
  open: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (form: RunForm) => void;
}

/** New Run modal — captures run type, title, and preset, then starts the run. */
export function RunModal({ open, submitting = false, onClose, onSubmit }: RunModalProps) {
  const [type, setType] = useState<RunType>("feature");
  const [title, setTitle] = useState("");
  const [preset, setPreset] = useState<SessionPreset>("light");

  const start = () => onSubmit({ type, title, preset });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Run"
      description="Spin up an isolated session worktree for a piece of work."
      size="md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} loading={submitting} disabled={submitting}>
            Start
          </Button>
        </>
      }
    >
      <div className="ses-form">
        <div className="ses-field" role="group" aria-labelledby="run-type-label">
          <span id="run-type-label" className="ses-label">
            Type
          </span>
          <Select options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as RunType)} />
        </div>

        <div className="ses-field">
          <label htmlFor="run-title" className="ses-label">
            Title
          </label>
          <Input
            id="run-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short, action-oriented summary"
          />
        </div>

        <div className="ses-field" role="group" aria-labelledby="run-preset-label">
          <span id="run-preset-label" className="ses-label">
            Preset
          </span>
          <Select
            options={PRESET_OPTIONS}
            value={preset}
            onChange={(v) => setPreset(v as SessionPreset)}
          />
        </div>
      </div>
    </Modal>
  );
}
