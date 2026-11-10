"use client";

import { ArrowDown, ArrowDownToLine, MessagesSquare, RotateCcw, Search, Sparkles } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { chatMarkdown, greeting, matchesMessage, type Message, type Source } from "@/lib/chat";
import { MessageBubble } from "./MessageBubble";

type Reply = {
  id: string; text: string; status: "streaming" | "stopped" | "error"; source?: Source; notice?: string;
};

function downloadChat(messages: Message[], name: string) {
  const blob = new Blob([chatMarkdown(messages, name)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "riruka-chat-history.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ChatContainer({ name, messages, reply, onRetry, onRemoveMessage, profile, sessionId, children }: {
  name: string; messages: Message[]; reply: Reply | null; onRetry: () => void;
  onRemoveMessage?: (id: string) => void;
  profile: string | null; sessionId: string; children: ReactNode;
}) {
  const feed = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [query, setQuery] = useState("");
  const streaming = reply?.status === "streaming";
  const canRetry = !streaming && messages.at(-1)?.role === "user";
  const filteredMessages = query.trim() ? messages.filter((m) => matchesMessage(m, query)) : messages;

  function jump() {
    const node = feed.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    nearBottom.current = true;
    setShowJump(false);
  }

  useLayoutEffect(jump, [profile, sessionId]);
  useLayoutEffect(() => {
    const node = feed.current;
    if (node && nearBottom.current && !query.trim()) node.scrollTop = node.scrollHeight;
  }, [messages, reply, query]);

  return (
    <section className="chat-card" aria-labelledby="chat-title">
      <header className="chat-head">
        <div className="chat-title-icon"><MessagesSquare size={21} aria-hidden="true" /></div>
        <div>
          <h1 id="chat-title">گفت‌وگو با ریروکا</h1>
          <p>یک پیام بفرست و واکنش ریروکا را ببین.</p>
        </div>
        {messages.length > 0 && (
          <div className="chat-head-tools">
            <label className="chat-search-box">
              <Search size={14} aria-hidden="true" />
              <span className="sr-only">جست‌وجو در پیام‌ها</span>
              <input
                type="search"
                dir="auto"
                value={query}
                maxLength={80}
                placeholder="جست‌وجو در پیام‌ها…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="chat-export-btn"
              onClick={() => downloadChat(messages, name)}
              title="دریافت تاریخچهٔ گفت‌وگو (Markdown)"
            >
              <ArrowDownToLine size={14} />
              <span>دریافت گفت‌وگو</span>
            </button>
          </div>
        )}
        <span className="chat-index" lang="en" dir="ltr">LIVE CHAT</span>
      </header>
      <div className="feed-wrap">
        <div className="feed" ref={feed} role="region" aria-label="تاریخچهٔ گفت‌وگو" tabIndex={0} onScroll={(event) => {
          const node = event.currentTarget;
          const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
          nearBottom.current = atBottom;
          setShowJump(!atBottom);
        }}>
          {profile ? <>
            <div className="feed-divider"><span />شروع گفت‌وگو<span /></div>
            {!query.trim() && <MessageBubble name={name} message={{ role: "assistant", id: "welcome", content: greeting, at: 0 }} />}
            {filteredMessages.map((message) => (
              <MessageBubble key={message.id} name={name} message={message} onRemove={onRemoveMessage} />
            ))}
            {query.trim() && filteredMessages.length === 0 && (
              <p className="feed-loading" role="status">پیامی با این عبارت پیدا نشد.</p>
            )}
            {reply?.text && !query.trim() && <MessageBubble name={name} plain message={{ role: "assistant", id: reply.id, content: reply.text, source: reply.source, at: 0 }} />}
            {streaming && !reply.text && <div className="typing" aria-hidden="true"><Sparkles size={15} /> <span>ریروکا در حال فکر کردنه</span><i /><i /><i /></div>}
            {canRetry && !query.trim() && <div className="retry-row">
              <span>{reply?.text ? "پاسخ ناتمام · " : ""}{reply?.notice ?? "این پیام هنوز پاسخ کامل ندارد."}</span>
              <button type="button" onClick={onRetry}><RotateCcw size={14} /> تلاش دوباره</button>
            </div>}
          </> : <p className="feed-loading" role="status">در حال آماده کردن گفت‌وگو…</p>}
        </div>
        {showJump && <button type="button" className="jump-button" onClick={jump}><ArrowDown size={15} /> پیام آخر</button>}
      </div>
      <div className="sr-only" aria-live="polite">{streaming ? "ریروکا در حال پاسخ است." : reply?.notice || (messages.at(-1)?.role === "assistant" ? "پاسخ ریروکا آماده است." : "")}</div>
      <div className="chat-foot">{children}</div>
    </section>
  );
}
