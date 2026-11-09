import { ArrowUp, Square } from "lucide-react";
import { faNumber, MAX_INPUT } from "@/lib/chat";
import { useLayoutEffect, type RefObject } from "react";

export function ChatInput({ value, onChange, onSend, onStop, streaming, ready, inputRef }: {
  value: string; onChange: (value: string) => void; onSend: () => void; onStop: () => void;
  streaming: boolean; ready: boolean; inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight + 2, 110) + "px";
  }, [inputRef, value]);

  return (
    <form className="composer" onSubmit={(event) => { event.preventDefault(); if (ready && !streaming && value.trim()) onSend(); }}>
      <div className="input-wrap">
        <label className="sr-only" htmlFor="message-input">پیام به ریروکا</label>
        <textarea ref={inputRef} id="message-input" rows={1} dir="auto" disabled={!ready}
          placeholder={ready ? "برای ریروکا پیام بنویس…" : "در حال آماده‌سازی گفت‌وگو…"}
          value={value} maxLength={MAX_INPUT} onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 &&
                window.matchMedia("(pointer: fine)").matches) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} />
        {value.length >= 1700 && <small className="char-count">{faNumber.format(value.length)} / {faNumber.format(MAX_INPUT)}</small>}
      </div>
      {streaming
        ? <button type="button" className="send-button stop-button" aria-label="توقف پاسخ" onClick={onStop}><Square size={17} fill="currentColor" /></button>
        : <button type="submit" className="send-button" disabled={!ready || !value.trim()} aria-label="ارسال پیام"><ArrowUp size={20} strokeWidth={2.6} /></button>}
    </form>
  );
}
