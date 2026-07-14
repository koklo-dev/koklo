import type { GateDecision, GateDto, KokloClient, SessionDto } from "@koklo/trpc-client";

export type GatesClient = Pick<KokloClient, "gates">;

export interface PendingGateItem {
  session: SessionDto;
  gate: GateDto;
}

export function gateKey(item: PendingGateItem): string {
  return item.gate.requestId ?? `${item.session.id}:${item.gate.phase}:${item.gate.description}`;
}

export function flattenPendingGates(
  sessions: readonly SessionDto[],
  gatesBySession: Record<string, readonly GateDto[]>,
): PendingGateItem[] {
  return sessions.flatMap((session) =>
    (gatesBySession[session.id] ?? []).map((gate) => ({ session, gate })),
  );
}

export function pendingGateCount(items: readonly PendingGateItem[]): number {
  return items.length;
}

export async function loadPendingGates(
  client: GatesClient,
  sessions: readonly SessionDto[],
): Promise<PendingGateItem[]> {
  const rows = await Promise.all(
    sessions.map(async (session) => [session.id, await client.gates.pending({ sessionId: session.id })] as const),
  );
  return flattenPendingGates(sessions, Object.fromEntries(rows));
}

export function removePendingGate(
  items: readonly PendingGateItem[],
  resolved: PendingGateItem,
): PendingGateItem[] {
  const resolvedKey = gateKey(resolved);
  return items.filter((item) => gateKey(item) !== resolvedKey);
}

export function gateKindLabel(kind: GateDto["kind"]): string {
  switch (kind) {
    case "command_execution":
      return "Command approval";
    case "file_change":
      return "File change review";
    case "permissions":
      return "Permission request";
    case "patch_apply":
      return "Patch apply review";
    default:
      return "Approval required";
  }
}

export function gateRisk(kind: GateDto["kind"]): "low" | "medium" | "high" {
  switch (kind) {
    case "permissions":
    case "patch_apply":
      return "high";
    case "file_change":
    case "command_execution":
    default:
      return "medium";
  }
}

export function gateWorktreeLabel(session: SessionDto): string {
  if (session.workspacePath && session.workspacePath !== session.projectPath) {
    return session.workspacePath;
  }
  return session.workspaceBranch || session.projectPath;
}

export function gateDescription(item: PendingGateItem): string {
  return `${item.gate.description}\nWorktree: ${gateWorktreeLabel(item.session)}`;
}

export function decisionCopy(action: Extract<GateDecision, "approve" | "reject">): {
  title: string;
  confirm: string;
  toastTitle: string;
  toastTone: "success" | "warning";
} {
  if (action === "approve") {
    return {
      title: "Approve this gate?",
      confirm: "Approve",
      toastTitle: "Gate approved",
      toastTone: "success",
    };
  }
  return {
    title: "Reject this gate?",
    confirm: "Reject",
    toastTitle: "Gate rejected",
    toastTone: "warning",
  };
}
