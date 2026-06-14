import { useState } from "react";
import { Badge } from "../../atoms/Badge/Badge";
import { Button } from "../../atoms/Button/Button";
import { Icon } from "../../atoms/Icon/Icon";
import { CodeBlock, type CodeLine } from "../../molecules/CodeBlock/CodeBlock";
import "./AiActionCard.css";

export type RiskLevel = "low" | "medium" | "high";
export type ActionState = "pending" | "applied" | "rejected";

export interface AiActionCardProps {
  title: string;
  description: string;
  filename: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  risk?: RiskLevel;
  risks?: string[];
  diffLines?: CodeLine[];
  state?: ActionState;
  testCount?: number;
  /** Hide the approve/reject/modify row (read-only render). Defaults to interactive. */
  readOnly?: boolean;
  onValidate?: () => void;
  onModify?: () => void;
  onReject?: () => void;
  onViewCommit?: () => void;
}

const riskVariant: Record<RiskLevel, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

/**
 * Approval/gate card. Vendored from `koklo-storybook` (`organisms/AiActionCard`)
 * with one addition: `readOnly` suppresses the action row so the transcript view
 * (US-018) can render a pending gate without owning its decision — gate approval
 * is US-019 (roadmap P2 §5).
 */
export function AiActionCard({
  title,
  description,
  filename,
  filesChanged = 1,
  linesAdded = 0,
  linesRemoved = 0,
  risk = "low",
  risks = [],
  diffLines = [],
  state = "pending",
  testCount,
  readOnly = false,
  onValidate,
  onModify,
  onReject,
  onViewCommit,
}: AiActionCardProps) {
  const [diffOpen, setDiffOpen] = useState(false);

  const hasDiff = diffLines.length > 0;
  const hasRisks = risks.length > 0;

  return (
    <div className={`kk-ai-card kk-ai-card-${state}`}>
      <div className="kk-ai-card-header">
        <div className="kk-ai-card-icon-box">
          <Icon name="Logo" size={20} />
        </div>
        <div className="kk-ai-card-meta">
          <span className="kk-ai-eyebrow">Koklo proposes</span>
          <span className="kk-ai-title">{title}</span>
        </div>
        <Badge variant={riskVariant[risk]} icon={<Icon name="AlertTriangle" size={9} />}>
          {risk} risk
        </Badge>
      </div>

      <p className="kk-ai-desc">{description}</p>

      <div className="kk-ai-stats-bar">
        <span className="kk-ai-file">
          <Icon name="FileCode" size={12} />
          {filename}
        </span>
        <span className="kk-ai-stat-sep" />
        <span className="kk-ai-file-count">
          <strong>{filesChanged}</strong> file{filesChanged > 1 ? "s" : ""}
        </span>
        <span className="kk-ai-adds">+{linesAdded}</span>
        <span className="kk-ai-rems">−{linesRemoved}</span>
      </div>

      {hasDiff && (
        <div className="kk-ai-diff">
          <button
            type="button"
            className="kk-ai-diff-toggle"
            onClick={() => setDiffOpen((v) => !v)}
          >
            <Icon name={diffOpen ? "ChevronDown" : "ChevronRight"} size={14} />
            <Icon name="Diff" size={14} />
            <span>{diffOpen ? "Hide" : "View"} diff preview</span>
            {!diffOpen && <span className="kk-ai-diff-hint">{diffLines.length} lines</span>}
          </button>
          {diffOpen && (
            <>
              <CodeBlock filename={filename} lines={diffLines} isDiff theme="light" />
              {hasRisks && (
                <div className="kk-ai-risks">
                  <div className="kk-ai-risks-header">
                    <Icon name="Shield" size={12} />
                    Before applying
                  </div>
                  <ul className="kk-ai-risks-list">
                    {risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!hasDiff && hasRisks && (
        <div className="kk-ai-risks">
          <div className="kk-ai-risks-header">
            <Icon name="Shield" size={12} />
            Before applying
          </div>
          <ul className="kk-ai-risks-list">
            {risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {!readOnly && state === "pending" && (
        <div className="kk-ai-actions">
          <Button variant="success" size="sm" icon={<Icon name="Check" size={13} />} onClick={onValidate}>
            Validate
          </Button>
          <Button variant="secondary" size="sm" icon={<Icon name="Pencil" size={13} />} onClick={onModify}>
            Modify
          </Button>
          <Button variant="danger-ghost" size="sm" icon={<Icon name="X" size={13} />} onClick={onReject}>
            Reject
          </Button>
          {testCount !== undefined && (
            <span className="kk-ai-tests">
              <Icon name="Check" size={12} />
              {testCount} test file{testCount !== 1 ? "s" : ""} queued
            </span>
          )}
        </div>
      )}

      {state === "applied" && (
        <div className="kk-ai-foot-applied">
          <Icon name="CheckCircle" size={14} />
          <span>Applied — tests queued.</span>
          {onViewCommit && (
            <button type="button" className="kk-ai-view-commit" onClick={onViewCommit}>
              View commit
            </button>
          )}
        </div>
      )}

      {state === "rejected" && (
        <div className="kk-ai-foot-rejected">
          <Icon name="X" size={14} />
          <span>Discarded. No changes saved to your project.</span>
        </div>
      )}
    </div>
  );
}
