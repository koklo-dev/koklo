import "./TypingIndicator.css";

export interface TypingIndicatorProps {
  label?: string;
  className?: string;
}

/**
 * Three pulsing dots shown while a streaming LLM line is still open.
 * Vendored verbatim from `koklo-storybook` (`atoms/TypingIndicator`).
 */
export function TypingIndicator({ label, className = "" }: TypingIndicatorProps) {
  return (
    <span className={`kk-typing ${className}`} aria-label={label ?? "Streaming"}>
      <span className="kk-typing-dot" />
      <span className="kk-typing-dot" />
      <span className="kk-typing-dot" />
      {label && <span className="kk-typing-label">{label}</span>}
    </span>
  );
}
