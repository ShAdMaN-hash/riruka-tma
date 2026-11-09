"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { Check, Clipboard, Copy, Sparkles, UserRound } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { sourceLabels, type Message } from "@/lib/chat";

const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });

function plainText(children: ReactNode): string {
  return Children.toArray(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") return child;
    if (isValidElement<{ children?: ReactNode }>(child)) return plainText(child.props.children);
    return "";
  }).join("");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copy, setCopy] = useState<"idle" | "done" | "error">("idle");
  return (
    <div className="code-block" dir="ltr">
      <div className="code-bar">
        <span><Clipboard size={13} /> کد</span>
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(plainText(children).replace(/\n$/, ""));
            setCopy("done");
          } catch {
            setCopy("error");
          }
        }}>
          {copy === "done" ? <Check size={13} /> : <Copy size={13} />}
          {copy === "done" ? "کپی شد" : copy === "error" ? "متن را دستی کپی کن" : "کپی کد"}
        </button>
      </div>
      <pre tabIndex={0} aria-label="بلوک کد">{children}</pre>
    </div>
  );
}

export function MessageBubble({ message, name, plain = false }: { message: Message; name: string; plain?: boolean }) {
  const fromUser = message.role === "user";
  return (
    <article className="message" data-role={message.role}>
      <span className="message-icon" aria-hidden="true">{fromUser ? <UserRound size={15} /> : <Sparkles size={16} />}</span>
      <div className="message-body">
        <div className="message-meta">
          <strong>{fromUser ? <bdi>{name}</bdi> : "ریروکا"}</strong>
          {message.source && <span>{sourceLabels[message.source]}</span>}
          {message.at > 0 && <time dateTime={new Date(message.at).toISOString()}>{time.format(message.at)}</time>}
        </div>
        <div className="bubble">
          {fromUser || plain ? <p className="plain-message" dir="auto">{message.content}</p> : (
            <div className="markdown" dir="auto">
              <ReactMarkdown skipHtml disallowedElements={["img"]} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}
                urlTransform={(url) => { try { return new URL(url).protocol === "https:" ? url : ""; } catch { return ""; } }}
                components={{
                  a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
                  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                  table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
                }}
              >{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
