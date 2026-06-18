import { useState } from "react";
import { Icon } from "../../atoms/Icon/Icon";
import "./CodeBlock.css";

export interface CodeLine {
  type?: "add" | "rem" | "context";
  content: string;
  lineNumber?: number;
}

export interface CodeBlockProps {
  filename?: string;
  language?: string;
  lines: CodeLine[];
  isDiff?: boolean;
  theme?: "dark" | "light";
}

/**
 * Monospace block for shell commands and tool output (and diff previews inside
 * `AiActionCard`). Vendored verbatim from `koklo-storybook` (`molecules/CodeBlock`).
 */
export function CodeBlock({ filename, lines, isDiff, theme = "dark" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = lines.map((l) => l.content).join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`kk-code-block kk-code-block-${theme}`}>
      {filename && (
        <div className="kk-code-header">
          <Icon name="FileCode" size={13} color="var(--color-fg-muted)" />
          <span className="kk-code-filename">{filename}</span>
          <button
            type="button"
            className="kk-code-copy"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? <Icon name="Check" size={13} /> : <Icon name="Copy" size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}
      <pre className="kk-code-body">
        {lines.map((line, i) => (
          <div
            key={i}
            className={["kk-code-line", isDiff && line.type && `kk-code-${line.type}`]
              .filter(Boolean)
              .join(" ")}
          >
            {isDiff && (
              <span className="kk-code-prefix">
                {line.type === "add" ? "+" : line.type === "rem" ? "−" : " "}
              </span>
            )}
            {line.lineNumber !== undefined && (
              <span className="kk-code-ln">{line.lineNumber}</span>
            )}
            <code>{line.content}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}
