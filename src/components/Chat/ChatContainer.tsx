"use client";

import { ArrowDown, MessagesSquare, RotateCcw, Sparkles } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { greeting, type Message, type Source } from "@/lib/chat";
import { MessageBubble } from "./MessageBubble";

type Reply = {
  id: string; text: string; status: "streaming" | "stopped" | "error"; source?: Source; notice?: string;
};

export function ChatContainer({ name, messages, reply, onRetry, profile, sessionId, children }: {
  name: string; messages: Message[]; reply: Reply | null; onRetry: () => void;
  profile: string | null; sessionId: string; children: ReactNode;
}) {
  const feed = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const streaming = reply?.status === "streaming";
  const canRetry = !streaming && messages.at(-1)?.role === "user";

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
    if (node && nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages, reply]);

  return (
    <section className="chat-card" aria-labelledby="chat-title">
      <header className="chat-head">
        <div className="chat-title-icon"><MessagesSquare size={21} aria-hidden="true" /></div>
        <div>
          <h1 id="chat-title">گفت‌وگو با ریروکا</h1>
          <p>یک پیام بفرست و واکنش ریروکا را ببین.</p>
        </div>
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
            <MessageBubble name={name} message={{ role: "assistant", id: "welcome", content: greeting, at: 0 }} />
            {messages.map((message) => <MessageBubble key={message.id} name={name} message={message} />)}
            {reply?.text && <MessageBubble name={name} plain message={{ role: "assistant", id: reply.id, content: reply.text, source: reply.source, at: 0 }} />}
            {streaming && !reply.text && <div className="typing" aria-hidden="true"><Sparkles size={15} /> <span>ریروکا در حال فکر کردنه</span><i /><i /><i /></div>}
            {canRetry && <div className="retry-row">
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
