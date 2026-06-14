import type { ReactNode } from "react";
import { Icon } from "../../atoms/Icon/Icon";
import "./MessageBubble.css";

export type MessageRole = "user" | "assistant";

export interface MessageBubbleProps {
  role: MessageRole;
  content: ReactNode;
  timestamp?: string;
  userName?: string;
  userInitials?: string;
  isTyping?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * One conversational line (LLM or user). Vendored verbatim from `koklo-storybook`
 * (`molecules/MessageBubble`). Used by the transcript view for `message`-family kinds.
 */
export function MessageBubble({
  role,
  content,
  timestamp,
  userName,
  userInitials,
  isTyping,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const initials = userInitials ?? (userName ? getInitials(userName) : "AY");

  return (
    <div className={`kk-msg kk-msg-${role}`}>
      <div className="kk-msg-avatar" aria-hidden="true">
        {isUser ? initials : <Icon name="Logo" size={18} />}
      </div>

      <div className="kk-msg-body">
        <div className="kk-msg-head">
          <span className="kk-msg-role">{isUser ? (userName ?? "You") : "Koklo"}</span>
          {timestamp && <span className="kk-msg-when">{timestamp}</span>}
        </div>

        {isTyping ? (
          <div className="kk-typing-bubble" aria-label="Typing">
            <span className="kk-typing-dot" />
            <span className="kk-typing-dot" />
            <span className="kk-typing-dot" />
          </div>
        ) : (
          <div className="kk-msg-bubble">
            <div className="kk-msg-content">{content}</div>
          </div>
        )}
      </div>
    </div>
  );
}
