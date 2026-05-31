import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";
import "./App.css";

function App() {
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem("conversations");
    return saved ? JSON.parse(saved) : [];
  });

  const [activeId, setActiveId] = useState(() => {
    return localStorage.getItem("activeId") || null;
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "light";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("conversations", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeId) localStorage.setItem("activeId", activeId);
  }, [activeId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const activeConversation = conversations.find((c) => c.id === activeId);
  const messages = activeConversation?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const handleNewChat = () => {
    const newConv = { id: uuidv4(), title: "New Chat", messages: [] };
    setConversations([newConv, ...conversations]);
    setActiveId(newConv.id);
    setSidebarOpen(false);
  };

  const handleSelectChat = (id) => {
    setActiveId(id);
    setSidebarOpen(false);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const filtered = conversations.filter((c) => c.id !== id);
    setConversations(filtered);
    if (activeId === id) {
      setActiveId(filtered[0]?.id || null);
    }
  };

  const handleDeleteMessage = (indexToDelete) => {
    const newMessages = messages.filter((_, i) => i !== indexToDelete);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, messages: newMessages } : c
      )
    );
  };

  const streamResponse = async (currentId, baseMessages) => {
    setLoading(true);

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentId
          ? { ...c, messages: [...baseMessages, { role: "assistant", content: "" }] }
          : c
      )
    );

    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: baseMessages,
          stream: true,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let aiContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta?.content || "";
            if (delta) {
              aiContent += delta;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentId
                    ? {
                      ...c,
                      messages: [
                        ...baseMessages,
                        { role: "assistant", content: aiContent },
                      ],
                    }
                    : c
                )
              );
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    } catch (error) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentId
            ? {
              ...c,
              messages: [
                ...baseMessages,
                { role: "assistant", content: "Error: " + error.message },
              ],
            }
            : c
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    let currentId = activeId;
    let currentMessages = messages;

    if (!currentId) {
      const newConv = { id: uuidv4(), title: "New Chat", messages: [] };
      setConversations([newConv, ...conversations]);
      setActiveId(newConv.id);
      currentId = newConv.id;
      currentMessages = [];
    }

    const userMessage = { role: "user", content: input };
    const newMessages = [...currentMessages, userMessage];

    if (currentMessages.length === 0) {
      const autoTitle = input.length > 40 ? input.slice(0, 40) + "..." : input;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentId
            ? { ...c, title: autoTitle, messages: newMessages }
            : c
        )
      );
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentId ? { ...c, messages: newMessages } : c
        )
      );
    }

    setInput("");
    await streamResponse(currentId, newMessages);
  };

  const handleRegenerate = async (aiIndex) => {
    if (loading) return;
    const messagesUpToAI = messages.slice(0, aiIndex);
    await streamResponse(activeId, messagesUpToAI);
  };

  const handleStartEdit = (index, currentContent) => {
    setEditingIndex(index);
    setEditingText(currentContent);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingText("");
  };

  const handleSaveEdit = async (index) => {
    if (!editingText.trim()) return;

    const updatedMessages = [
      ...messages.slice(0, index),
      { role: "user", content: editingText },
    ];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, messages: updatedMessages } : c
      )
    );

    setEditingIndex(null);
    setEditingText("");

    await streamResponse(activeId, updatedMessages);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        style={{
          width: "260px",
          background: "var(--bg-sidebar)",
          color: "var(--text-on-sidebar)",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          overflowY: "auto",
        }}
      >
        <button
          onClick={handleNewChat}
          style={{
            padding: "0.75rem",
            background: "transparent",
            border: "1px solid var(--border-sidebar)",
            color: "var(--text-on-sidebar)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.95rem",
            marginBottom: "0.5rem",
          }}
        >
          + New Chat
        </button>

        {conversations.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            No conversations yet.
          </p>
        )}

        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => handleSelectChat(conv.id)}
            style={{
              padding: "0.6rem 0.75rem",
              background:
                conv.id === activeId ? "var(--bg-sidebar-active)" : "transparent",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.9rem",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {conv.title}
            </span>
            <button
              onClick={(e) => handleDelete(conv.id, e)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "0.9rem",
                marginLeft: "0.5rem",
              }}
              title="Delete conversation"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          onClick={toggleTheme}
          style={{
            marginTop: "auto",
            padding: "0.6rem",
            background: "transparent",
            border: "1px solid var(--border-sidebar)",
            color: "var(--text-on-sidebar)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
          title="Toggle theme"
        >
          {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </aside>

      {/* MAIN CHAT AREA */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-app)",
          color: "var(--text-primary)",
          minWidth: 0,
        }}
      >
        {/* Mobile header with hamburger */}
        <div className="mobile-header">
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: "1.5rem",
              cursor: "pointer",
              padding: "0.5rem",
            }}
            title="Open menu"
          >
            ☰
          </button>
          <span style={{ fontWeight: "600" }}>AI Chat</span>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "2rem",
            maxWidth: "800px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          {messages.length === 0 && (
            <p
              style={{
                color: "var(--text-muted)",
                textAlign: "center",
                marginTop: "4rem",
              }}
            >
              Start a conversation by typing below.
            </p>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                marginBottom: "1rem",
                padding: "0.75rem 1rem",
                background:
                  msg.role === "user" ? "var(--bg-user-msg)" : "var(--bg-ai-msg)",
                color: "var(--text-primary)",
                borderRadius: "8px",
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.25rem",
                }}
              >
                <strong>{msg.role === "user" ? "You" : "AI"}:</strong>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {msg.role === "user" && editingIndex !== index && (
                    <button
                      onClick={() => handleStartEdit(index, msg.content)}
                      disabled={loading}
                      title="Edit this message"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      ✏️
                    </button>
                  )}

                  {msg.role === "assistant" && msg.content && (
                    <button
                      onClick={() => handleRegenerate(index)}
                      disabled={loading}
                      title="Regenerate response"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      🔄
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteMessage(index)}
                    title="Delete this message"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {msg.role === "assistant" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ code: CodeBlock }}
                >
                  {msg.content ||
                    (loading && index === messages.length - 1 ? "..." : "")}
                </ReactMarkdown>
              ) : editingIndex === index ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows="3"
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      fontSize: "0.95rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-input)",
                      background: "var(--bg-input)",
                      color: "var(--text-primary)",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                  <div
                    style={{
                      marginTop: "0.5rem",
                      display: "flex",
                      gap: "0.5rem",
                    }}
                  >
                    <button
                      onClick={() => handleSaveEdit(index)}
                      disabled={loading}
                      style={{
                        padding: "0.4rem 1rem",
                        background: "var(--bg-button-primary)",
                        color: "var(--text-on-primary)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Save & Submit
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        padding: "0.4rem 1rem",
                        background: "transparent",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-input)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>{msg.content}</div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div
          style={{
            padding: "1rem 2rem",
            borderTop: "1px solid var(--border-color)",
            maxWidth: "800px",
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask something... (Enter to send, Shift+Enter for new line)"
            rows="3"
            style={{
              width: "100%",
              padding: "0.75rem",
              fontSize: "1rem",
              borderRadius: "8px",
              border: "1px solid var(--border-input)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              resize: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              marginTop: "0.5rem",
              padding: "0.6rem 1.5rem",
              fontSize: "1rem",
              background: "var(--bg-button-primary)",
              color: "var(--text-on-primary)",
              border: "none",
              borderRadius: "6px",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              opacity: loading || !input.trim() ? 0.6 : 1,
            }}
          >
            {loading ? "Streaming..." : "Send"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;