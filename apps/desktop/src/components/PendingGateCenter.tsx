import { AiActionCard, Badge, Button, Icon, StatusDot } from "@koklo/ui";
import {
  gateDescription,
  gateKey,
  gateKindLabel,
  gateRisk,
  gateWorktreeLabel,
  type PendingGateItem,
} from "../lib/gatesModel";
import "./PendingGateCenter.css";

export interface PendingGateCenterProps {
  items: readonly PendingGateItem[];
  busyKey?: string | null;
  onApprove: (item: PendingGateItem) => void;
  onReject: (item: PendingGateItem) => void;
  onOpenSession?: (item: PendingGateItem) => void;
}

export function PendingGateCenter({
  items,
  busyKey,
  onApprove,
  onReject,
  onOpenSession,
}: PendingGateCenterProps) {
  if (items.length === 0) return null;

  return (
    <section className="pgc-section" aria-label="Pending approvals">
      <div className="pgc-head">
        <div>
          <h2 className="pgc-title">
            <StatusDot status="pending" pulse label="Pending gates" />
            Pending gates
          </h2>
          <p className="pgc-copy">
            Review and unblock active runs here without opening the live transcript.
          </p>
        </div>
        <Badge variant="warning">{items.length} waiting</Badge>
      </div>

      <div className="pgc-list">
        {items.map((item) => {
          const key = gateKey(item);
          const isBusy = busyKey === key;
          return (
            <article key={key} className="pgc-item">
              <div className="pgc-item-head">
                <div className="pgc-meta">
                  <span className="pgc-session">{item.session.title}</span>
                  <Badge variant="info" size="sm">
                    {item.gate.phase}
                  </Badge>
                  <Badge variant="default" size="sm">
                    {gateKindLabel(item.gate.kind)}
                  </Badge>
                </div>
                <div className="pgc-actions">
                  <Badge
                    variant="default"
                    size="sm"
                    icon={<Icon name="Branch" size={10} aria-hidden />}
                  >
                    {gateWorktreeLabel(item.session)}
                  </Badge>
                  {onOpenSession && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => onOpenSession(item)}
                    >
                      Open session
                    </Button>
                  )}
                </div>
              </div>

              <AiActionCard
                title={item.session.title}
                description={gateDescription(item)}
                filename={item.gate.requestId ?? item.gate.phase}
                risk={gateRisk(item.gate.kind)}
                onValidate={() => onApprove(item)}
                onModify={onOpenSession ? () => onOpenSession(item) : undefined}
                onReject={() => onReject(item)}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
