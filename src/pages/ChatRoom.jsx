import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import EmojiPicker from "emoji-picker-react";
import {
  getMessages, blockUser, unblockUser, clearConversation, getChatPartner,
  uploadAttachment, reactToMessage, unsendMessage, deleteForMe,
} from "../api/chats";
import { getMe } from "../api/auth";
import { connectToChat } from "../api/socket";
import { timeAgo } from "../utils/timeAgo";
import { useCall } from "../context/CallContext";

export default function ChatRoom() {
  const { chatId } = useParams();
  const { startCall } = useCall();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [me, setMe] = useState(null);
  const [connected, setConnected] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [partner, setPartner] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [msgMenuFor, setMsgMenuFor] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const socketRef = useRef(null);
  const meRef = useRef(null);
  const bottomRef = useRef(null);
  const messagesBoxRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const stopTypingTimeoutRef = useRef(null);
  const navigate = useNavigate();

  function scrollToBottom() {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  useEffect(() => {
    let cancelled = false;

    getMe().then((user) => {
      if (cancelled) return;
      setMe(user);
      meRef.current = user;
    });

    getChatPartner(chatId).then((p) => { if (!cancelled) setPartner(p); });

    getMessages(chatId).then(({ results, has_more }) => {
      if (cancelled) return;
      setMessages(results);
      setHasMore(has_more);
      results.forEach((msg) => {
        if (msg.sender !== meRef.current?.id && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: "read", message_id: msg.id }));
        }
      });
      scrollToBottom();
    });

    const socket = connectToChat(chatId, (data) => {
      if (data.type === "chat_message") {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message_id)) return prev;
          return [
            ...prev,
            {
              ...data,
              id: data.message_id,
              sender_username: data.sender,
              read_by: [],
              attachments: data.attachments || [],
              reactions: [],
              message_type: data.message_type || "text",
            },
          ];
        });
        scrollToBottom();
        if (data.message_type !== "call" && data.sender !== meRef.current?.username) {
          const audio = new Audio("/notification.mp3");
          audio.play().catch(() => {});
          socket.send(JSON.stringify({ type: "read", message_id: data.message_id }));
        }
      }

      if (data.type === "read_event") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.message_id
              ? { ...msg, read_by: [...(msg.read_by || []), { username: data.username, read_at: new Date().toISOString() }] }
              : msg
          )
        );
      }

      if (data.type === "reaction_event") {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === data.message_id ? { ...msg, reactions: data.reactions } : msg))
        );
      }

      if (data.type === "message_deleted_event") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.message_id ? { ...msg, is_deleted: true, content: "This message was deleted" } : msg
          )
        );
      }

      if (data.type === "typing_event" && data.username !== meRef.current?.username) {
        if (data.is_typing) {
          setTypingUser(data.username);
          clearTimeout(stopTypingTimeoutRef.current);
          stopTypingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
          scrollToBottom();
        } else {
          setTypingUser(null);
        }
      }

      if (data.type === "error") {
        setErrorMsg(data.detail);
        setTimeout(() => setErrorMsg(""), 4000);
      }
    });

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socketRef.current = socket;

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [chatId]);

  async function loadOlderMessages() {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const container = messagesBoxRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const oldestId = messages[0].id;

    try {
      const { results, has_more } = await getMessages(chatId, oldestId);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOnes = results.filter((m) => !existingIds.has(m.id));
        return [...newOnes, ...prev];
      });
      setHasMore(has_more);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevScrollHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  }

  function handleScroll(e) {
    if (e.target.scrollTop < 60) loadOlderMessages();
  }

  function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ content: text }));
    socketRef.current.send(JSON.stringify({ type: "typing", is_typing: false }));
    setText("");
    setEmojiOpen(false);
  }

  function handleTyping(e) {
    setText(e.target.value);
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "typing", is_typing: true }));
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.send(JSON.stringify({ type: "typing", is_typing: false }));
    }, 2000);
  }

  function handleEmojiClick(emojiData) {
    setText((prev) => prev + emojiData.emoji);
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || partner?.blocked_by_me) return;

    setUploading(true);
    try {
      const attachment = await uploadAttachment(chatId, file, "");
      setMessages((prev) => {
        if (prev.some((m) => m.id === attachment.message)) return prev;
        return [
          ...prev,
          {
            id: attachment.message,
            sender: meRef.current?.id,
            sender_username: meRef.current?.username,
            content: "",
            read_by: [],
            attachments: [attachment],
            reactions: [],
            message_type: "text",
          },
        ];
      });
      scrollToBottom();
    } catch (err) {
      setErrorMsg("Couldn't send that file.");
      setTimeout(() => setErrorMsg(""), 4000);
    } finally {
      setUploading(false);
    }
  }

  async function handleBlockToggle() {
    if (!partner?.user) return;
    setMenuOpen(false);
    if (partner.blocked_by_me) {
      await unblockUser(partner.user.id);
      setPartner({ ...partner, blocked_by_me: false });
    } else {
      if (!confirm(`Block ${partner.user.username}? They won't be able to message you anymore. You can still see your past messages.`)) return;
      await blockUser(partner.user.id);
      setPartner({ ...partner, blocked_by_me: true });
    }
  }

  async function handleClearConversation() {
    setMenuOpen(false);
    if (!confirm("Delete this conversation? This only removes it from your view - the other person will still see it.")) return;
    await clearConversation(chatId);
    setMessages([]);
    setHasMore(false);
  }

  async function handleDownload(url) {
    setDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = url.split("/").pop() || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setErrorMsg("Couldn't download that file.");
      setTimeout(() => setErrorMsg(""), 4000);
    } finally {
      setDownloading(false);
    }
  }

  async function handleReact(messageId, emojiData) {
    setReactionPickerFor(null);
    setMsgMenuFor(null);
    const emoji = emojiData.emoji;
    try {
      const updated = await reactToMessage(messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: updated.reactions } : m)));
    } catch {
      setErrorMsg("Couldn't react to that message.");
      setTimeout(() => setErrorMsg(""), 4000);
    }
  }

  function handleCopy(content) {
    setMsgMenuFor(null);
    navigator.clipboard?.writeText(content).catch(() => {});
  }

  async function handleUnsend(messageId) {
    setMsgMenuFor(null);
    if (!confirm("Unsend this message? It will be removed for everyone.")) return;
    try {
      await unsendMessage(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, content: "This message was deleted" } : m))
      );
    } catch {
      setErrorMsg("Couldn't unsend that message.");
      setTimeout(() => setErrorMsg(""), 4000);
    }
  }

  async function handleDeleteForMe(messageId) {
    setMsgMenuFor(null);
    try {
      await deleteForMe(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      setErrorMsg("Couldn't delete that message.");
      setTimeout(() => setErrorMsg(""), 4000);
    }
  }

  function handleStartCall(type) {
    if (!partner?.user) return;
    startCall(partner.user.id, partnerName, chatId, type);
  }

  function renderAttachment(att) {
    if (att.file_type?.startsWith("image/")) {
      return (
        <img
          src={att.file_url}
          alt="attachment"
          style={{ ...styles.attachmentImg, cursor: "pointer" }}
          onClick={() => setViewerImage(att.file_url)}
        />
      );
    }
    if (att.file_type?.startsWith("video/")) {
      return <video src={att.file_url} controls style={styles.attachmentVideo} />;
    }
    return (
      <a href={att.file_url} target="_blank" rel="noreferrer" style={styles.documentLink}>
        📄 {att.file_url.split("/").pop()}
      </a>
    );
  }

  function callLogText(msg) {
    const icon = msg.call_type === "video" ? "🎥" : "📞";
    if (msg.call_status === "missed") return `${icon} Missed call`;
    if (msg.call_status === "declined") return `${icon} Call declined`;
    if (msg.call_status === "completed") {
      const secs = msg.call_duration_seconds || 0;
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${icon} ${msg.call_type === "video" ? "Video" : "Voice"} call · ${m}:${String(s).padStart(2, "0")}`;
    }
    return `${icon} Call`;
  }

  function groupedReactions(reactions) {
    const counts = {};
    (reactions || []).forEach((r) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    });
    return Object.entries(counts);
  }

  const lastMineIndex = [...messages].reverse().findIndex((m) => m.sender_username === me?.username || m.sender === me?.id);
  const lastMineMsg = lastMineIndex !== -1 ? messages[messages.length - 1 - lastMineIndex] : null;
  const lastMineSeenBy = lastMineMsg?.read_by?.find((r) => r.username !== me?.username);
  const partnerName = partner?.user?.username || "Chat";

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button onClick={() => navigate("/chats")} style={styles.backBtn}>←</button>
        <div style={{ flex: 1 }}>
          <div style={styles.headerTitle}>{partnerName}</div>
          <div style={{ fontSize: 12, color: connected ? "#31a24c" : "#e41e3f" }}>
            {connected ? "Active now" : "Connecting..."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => handleStartCall("audio")} style={styles.iconBtn} title="Voice call">📞</button>
          <button onClick={() => handleStartCall("video")} style={styles.iconBtn} title="Video call">🎥</button>
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => setMenuOpen((v) => !v)} style={styles.moreBtn}>⋮</button>
          {menuOpen && (
            <>
              <div style={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
              <div style={styles.menu}>
                <div style={styles.menuItem} onClick={handleBlockToggle}>
                  {partner?.blocked_by_me ? "Unblock" : "Block"}
                </div>
                <div style={styles.menuItem} onClick={handleClearConversation}>Delete conversation</div>
                <div style={{ ...styles.menuItem, color: "#e41e3f" }} onClick={() => setMenuOpen(false)}>Report</div>
              </div>
            </>
          )}
        </div>
      </div>

      {partner?.blocked_by_me && (
        <div style={styles.blockedBanner}>
          You've blocked {partnerName}. They can't message you, but you can still see past messages.
        </div>
      )}
      {errorMsg && <div style={styles.errorBanner}>{errorMsg}</div>}
      {uploading && <div style={styles.uploadingBanner}>Sending file...</div>}

      <div style={styles.messagesBox} ref={messagesBoxRef} onScroll={handleScroll}>
        {loadingMore && <div style={styles.loadingMoreText}>Loading earlier messages...</div>}
        {!hasMore && messages.length > 0 && (
          <div style={styles.startOfChatText}>You've reached the start of this conversation</div>
        )}

        {messages.map((msg, i) => {
          if (msg.message_type === "call") {
            return (
              <div key={msg.id || i} style={styles.callLogRow}>
                <div style={styles.callLogPill}>{callLogText(msg)}</div>
              </div>
            );
          }

          const isMine = msg.sender_username === me?.username || msg.sender === me?.id;
          const reactions = groupedReactions(msg.reactions);

          return (
            <div
              key={msg.id || i}
              style={{
                ...styles.messageWrapper,
                alignSelf: isMine ? "flex-end" : "flex-start",
                alignItems: isMine ? "flex-end" : "flex-start",
              }}
            >
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
                {isMine && (
                  <button style={styles.dotsBtn} onClick={() => setMsgMenuFor(msgMenuFor === msg.id ? null : msg.id)}>⋯</button>
                )}

                <div>
                  {msg.attachments?.map((att, idx) => (
                    <div key={att.id || idx} style={{ marginBottom: 4 }}>{renderAttachment(att)}</div>
                  ))}
                  {msg.content && !msg.is_deleted && (
                    <div style={{ ...styles.bubble, ...(isMine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                      {msg.content}
                    </div>
                  )}
                  {msg.is_deleted && (
                    <div style={{ ...styles.bubble, ...styles.bubbleDeleted }}>This message was deleted</div>
                  )}
                </div>

                {!isMine && (
                  <button style={styles.dotsBtn} onClick={() => setMsgMenuFor(msgMenuFor === msg.id ? null : msg.id)}>⋯</button>
                )}

                {msgMenuFor === msg.id && (
                  <>
                    <div style={styles.menuBackdrop} onClick={() => setMsgMenuFor(null)} />
                    <div style={{ ...styles.msgMenu, [isMine ? "right" : "left"]: 0 }}>
                      <div style={styles.menuItem} onClick={() => setReactionPickerFor(msg.id)}>React</div>
                      {msg.content && !msg.is_deleted && (
                        <div style={styles.menuItem} onClick={() => handleCopy(msg.content)}>Copy</div>
                      )}
                      {isMine && !msg.is_deleted && (
                        <div style={{ ...styles.menuItem, color: "#e41e3f" }} onClick={() => handleUnsend(msg.id)}>
                          Unsend
                        </div>
                      )}
                      <div style={styles.menuItem} onClick={() => handleDeleteForMe(msg.id)}>Delete for me</div>
                    </div>
                  </>
                )}
              </div>

              {reactionPickerFor === msg.id && (
                <>
                  <div style={styles.menuBackdrop} onClick={() => setReactionPickerFor(null)} />
                  <div style={styles.reactionPickerWrap}>
                    <EmojiPicker onEmojiClick={(e) => handleReact(msg.id, e)} width={320} height={450} />
                  </div>
                </>
              )}

              {reactions.length > 0 && (
                <div style={styles.reactionsRow}>
                  {reactions.map(([emoji, count]) => (
                    <span key={emoji} style={styles.reactionPill}>
                      {emoji} {count > 1 ? count : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {typingUser && (
          <div style={{ ...styles.messageWrapper, alignSelf: "flex-start", alignItems: "flex-start" }}>
            <div style={{ ...styles.bubble, ...styles.bubbleTheirs, ...styles.typingBubble }}>
              <span style={styles.dot} /><span style={styles.dot} /><span style={styles.dot} />
            </div>
          </div>
        )}

        {lastMineMsg && lastMineSeenBy && (
          <div style={styles.seenLabel}>Seen {timeAgo(lastMineSeenBy.read_at)}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {emojiOpen && (
        <div style={styles.emojiPickerWrap}>
          <EmojiPicker onEmojiClick={handleEmojiClick} width="100%" height={350} />
        </div>
      )}

      <form onSubmit={sendMessage} style={styles.inputRow}>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={partner?.blocked_by_me} style={styles.iconBtn}>
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />
        <button type="button" onClick={() => setEmojiOpen((v) => !v)} disabled={partner?.blocked_by_me} style={styles.iconBtn}>
          😊
        </button>
        <input
          value={text}
          onChange={handleTyping}
          placeholder={partner?.blocked_by_me ? "You've blocked this person" : "Message..."}
          disabled={partner?.blocked_by_me}
          style={styles.input}
        />
        <button type="submit" disabled={partner?.blocked_by_me} style={styles.sendBtn}>➤</button>
      </form>

      {viewerImage && (
        <div style={styles.viewerBackdrop} onClick={() => setViewerImage(null)}>
          <button style={styles.viewerClose} onClick={() => setViewerImage(null)}>✕</button>
          <img src={viewerImage} alt="full size" style={styles.viewerImage} onClick={(e) => e.stopPropagation()} />
          <button
            style={styles.viewerDownloadBtn}
            disabled={downloading}
            onClick={(e) => { e.stopPropagation(); handleDownload(viewerImage); }}
          >
            {downloading ? "Downloading..." : "⬇ Download"}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { width: "100%", maxWidth: 700, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: "#fff" },
  header: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #eee" },
  backBtn: { border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#050505" },
  headerTitle: { fontWeight: 600, fontSize: 16 },
  moreBtn: { border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#050505", padding: "0 8px", lineHeight: 1 },
  menuBackdrop: { position: "fixed", inset: 0, zIndex: 10 },
  menu: { position: "absolute", top: 32, right: 0, background: "#fff", border: "1px solid #eee", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 180, zIndex: 20, overflow: "hidden" },
  menuItem: { padding: "12px 16px", fontSize: 14, cursor: "pointer", color: "#050505" },
  blockedBanner: { background: "#fff3cd", color: "#856404", padding: "8px 16px", fontSize: 13, textAlign: "center" },
  errorBanner: { background: "#ffe5e9", color: "#e41e3f", padding: "8px 16px", fontSize: 13, textAlign: "center" },
  uploadingBanner: { background: "#e7f3ff", color: "#0084ff", padding: "6px 16px", fontSize: 13, textAlign: "center" },
  loadingMoreText: { textAlign: "center", fontSize: 12, color: "#8a8d91", padding: "8px 0" },
  startOfChatText: { textAlign: "center", fontSize: 12, color: "#8a8d91", padding: "8px 0" },
  messagesBox: { flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" },
  messageWrapper: { display: "flex", flexDirection: "column", maxWidth: "480px", position: "relative" },
  bubble: { padding: "9px 14px", borderRadius: 20, fontSize: 15, lineHeight: 1.35, wordBreak: "break-word", display: "inline-block" },
  bubbleMine: { background: "#0084ff", color: "#fff", borderBottomRightRadius: 4 },
  bubbleTheirs: { background: "#f0f0f0", color: "#050505", borderBottomLeftRadius: 4 },
  bubbleDeleted: { background: "#f0f0f0", color: "#8a8d91", fontStyle: "italic", borderRadius: 20 },
  typingBubble: { display: "flex", gap: 4, alignItems: "center", padding: "12px 16px" },
  dot: { width: 6, height: 6, borderRadius: "50%", background: "#999", display: "inline-block" },
  seenLabel: { alignSelf: "flex-end", fontSize: 11, color: "#8a8d91", marginTop: 2, marginRight: 4 },
  emojiPickerWrap: { borderTop: "1px solid #eee" },
  inputRow: { display: "flex", alignItems: "center", gap: 6, padding: 12, borderTop: "1px solid #eee" },
  iconBtn: { border: "none", background: "none", fontSize: 20, cursor: "pointer", padding: 4 },
  input: { flex: 1, padding: "10px 16px", borderRadius: 22, border: "1px solid #ddd", fontSize: 15, outline: "none" },
  sendBtn: { width: 40, height: 40, borderRadius: "50%", border: "none", background: "#0084ff", color: "#fff", fontSize: 16, cursor: "pointer" },
  attachmentImg: { maxWidth: 220, maxHeight: 220, borderRadius: 12, display: "block" },
  attachmentVideo: { maxWidth: 240, borderRadius: 12, display: "block" },
  documentLink: { display: "inline-block", padding: "8px 12px", background: "#f0f0f0", borderRadius: 12, fontSize: 13, color: "#050505", textDecoration: "none" },
  viewerBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 100, gap: 16, padding: 20 },
  viewerClose: { position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, width: 40, height: 40, borderRadius: "50%", cursor: "pointer" },
  viewerImage: { maxWidth: "90%", maxHeight: "75vh", borderRadius: 8, objectFit: "contain" },
  viewerDownloadBtn: { padding: "10px 24px", borderRadius: 22, border: "none", background: "#0084ff", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  dotsBtn: { border: "none", background: "none", fontSize: 16, cursor: "pointer", color: "#8a8d91", padding: 2 },
  msgMenu: { position: "absolute", top: 24, background: "#fff", border: "1px solid #eee", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 150, zIndex: 20, overflow: "hidden" },
  reactionPickerWrap: { position: "absolute", top: 24, zIndex: 20 },
  reactionsRow: { display: "flex", gap: 4, marginTop: 2 },
  reactionPill: { background: "#f0f0f0", borderRadius: 12, padding: "2px 6px", fontSize: 12 },
  callLogRow: { display: "flex", justifyContent: "center", margin: "8px 0" },
  callLogPill: { background: "#f0f0f0", color: "#65676b", borderRadius: 16, padding: "6px 14px", fontSize: 13 },
};