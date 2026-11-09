import { AudioLines, Radio, UserRound, Volume2, VolumeX } from "lucide-react";
import { sourceLabels, type Source } from "@/lib/chat";

export function Header({ name, source, sound, streaming, onSound }: {
  name: string; source?: Source; sound: boolean; streaming: boolean; onSound: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-icon" aria-hidden="true"><AudioLines size={23} strokeWidth={2.5} /></div>
        <div>
          <div className="brand-title">ریروکا <span lang="en" dir="ltr">RIRUKA</span></div>
          <div className="brand-sub">همراه گفت‌وگوی تو</div>
        </div>
      </div>
      <div className="top-tools">
        <span className="person-pill"><UserRound size={15} aria-hidden="true" /><bdi>{name}</bdi></span>
        <span className="status-pill" data-live={source && source !== "mock" ? "true" : "false"}>
          <Radio size={15} aria-hidden="true" />{streaming && !source ? "در حال اتصال" : source ? sourceLabels[source] : "آمادهٔ گفت‌وگو"}
        </span>
        <button type="button" className="icon-button" onClick={onSound} aria-pressed={sound} aria-label="صدای ریروکا" title={sound ? "خاموش کردن صدا" : "روشن کردن صدا"}>
          {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
      </div>
    </header>
  );
}
