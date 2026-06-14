/**
 * `@koklo/ui` — Koklo desktop design-system components.
 *
 * Vendored faithfully from the `koklo-storybook` source of truth (same `kk-`
 * token classes, same markup — no re-styling) so `apps/desktop` can consume the
 * DS without depending on the private Storybook repo. This is the screen-scoped
 * subset US-017 needs; the full DS port (Shell/Sidebar/TopBar + remaining
 * components) is the sprint-010 `packages/ui` consolidation (US-020).
 *
 * Import the token stylesheet once at the app root: `@koklo/ui/tokens.css`.
 */
export { Icon } from "./components/atoms/Icon/Icon";
export type { IconName, IconProps } from "./components/atoms/Icon/Icon";
export { Badge } from "./components/atoms/Badge/Badge";
export type { BadgeProps, BadgeVariant, BadgeSize } from "./components/atoms/Badge/Badge";
export { StatusDot } from "./components/atoms/StatusDot/StatusDot";
export type { StatusDotProps, StatusDotVariant } from "./components/atoms/StatusDot/StatusDot";
export { Spinner } from "./components/atoms/Spinner/Spinner";
export type { SpinnerProps } from "./components/atoms/Spinner/Spinner";
export { TypingIndicator } from "./components/atoms/TypingIndicator/TypingIndicator";
export type { TypingIndicatorProps } from "./components/atoms/TypingIndicator/TypingIndicator";
export { Button } from "./components/atoms/Button/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./components/atoms/Button/Button";
export { Input } from "./components/atoms/Input/Input";
export type { InputProps, InputSize } from "./components/atoms/Input/Input";
export { Select } from "./components/atoms/Select/Select";
export type { SelectProps, SelectOption } from "./components/atoms/Select/Select";
export { Modal } from "./components/molecules/Modal/Modal";
export type { ModalProps, ModalSize } from "./components/molecules/Modal/Modal";
export { EmptyState } from "./components/molecules/EmptyState/EmptyState";
export type { EmptyStateProps } from "./components/molecules/EmptyState/EmptyState";
export { SessionCard } from "./components/molecules/SessionCard/SessionCard";
export type {
  SessionCardProps,
  SessionStatus,
  SessionType,
  SessionPreset,
} from "./components/molecules/SessionCard/SessionCard";
export { Toast, Toaster } from "./components/molecules/Toast/Toast";
export type { ToastProps, ToasterProps, ToastItem, ToastTone } from "./components/molecules/Toast/Toast";
export { useToast } from "./components/molecules/Toast/ToastContext";
export type { ToasterContextValue } from "./components/molecules/Toast/ToastContext";
export { MessageBubble } from "./components/molecules/MessageBubble/MessageBubble";
export type { MessageBubbleProps, MessageRole } from "./components/molecules/MessageBubble/MessageBubble";
export { CodeBlock } from "./components/molecules/CodeBlock/CodeBlock";
export type { CodeBlockProps, CodeLine } from "./components/molecules/CodeBlock/CodeBlock";
export { AiActionCard } from "./components/organisms/AiActionCard/AiActionCard";
export type {
  AiActionCardProps,
  RiskLevel,
  ActionState,
} from "./components/organisms/AiActionCard/AiActionCard";
export { BootScreen } from "./components/organisms/BootScreen/BootScreen";
export type { BootScreenProps } from "./components/organisms/BootScreen/BootScreen";
export { Shell } from "./components/organisms/Shell/Shell";
export type { ShellProps } from "./components/organisms/Shell/Shell";
export type { SidebarProps, SidebarNavItem } from "./components/organisms/Sidebar/Sidebar";
export type { TopBarProps } from "./components/organisms/TopBar/TopBar";
export type { BreadcrumbItem } from "./components/molecules/Breadcrumb/Breadcrumb";
