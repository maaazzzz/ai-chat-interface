import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);

  // Extract language from className (react-markdown passes it as "language-xyz")
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const codeString = String(children).replace(/\n$/, "");

  // Inline code (single backticks like `this`) — render as a simple styled span
  if (inline) {
    return (
      <code
        style={{
          background: "#eee",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "0.9em",
          fontFamily: "monospace",
        }}
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Block code (triple backticks) — render with syntax highlighting + copy button
  return (
    <div
      style={{
        position: "relative",
        margin: "0.75rem 0",
        borderRadius: "8px",
        overflow: "hidden",
        background: "#282c34",
      }}
    >
      {/* Top bar with language name and copy button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.4rem 0.75rem",
          background: "#1e2127",
          color: "#abb2bf",
          fontSize: "0.8rem",
          fontFamily: "monospace",
        }}
      >
        <span>{language || "code"}</span>
        <button
          onClick={handleCopy}
          style={{
            background: "transparent",
            border: "1px solid #4b5263",
            color: copied ? "#98c379" : "#abb2bf",
            padding: "2px 10px",
            borderRadius: "4px",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* The highlighted code itself */}
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "1rem",
          background: "#282c34",
          fontSize: "0.9rem",
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}

export default CodeBlock;