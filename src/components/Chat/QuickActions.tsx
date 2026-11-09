import { CodeXml, Flame, Hand, Heart, Trash2 } from "lucide-react";

export function QuickActions({ onPat, onSend, onCode, onClear, disabled }: {
  onPat: () => void; onSend: (text: string) => void; onCode: () => void; onClear: () => void; disabled: boolean;
}) {
  return (
    <nav className="quick-actions" aria-label="میانبرهای واکنشی">
      <button type="button" onClick={onPat}><Hand size={14} />نوازش سر</button>
      <button type="button" disabled={disabled} onClick={() => onSend("ریروکا، امروز خیلی زیبایی!")}><Heart size={14} />تعریف از ریروکا</button>
      <button type="button" disabled={disabled} onClick={() => onSend("ریروکا، امروز با یکی از دوست‌های جدیدم حرف زدم.")}><Flame size={14} />تست حسادت</button>
      <button type="button" onClick={onCode}><CodeXml size={14} />کمک برای کدنویسی</button>
      <button type="button" className="clear-chip" onClick={onClear} aria-label="پاک کردن حافظهٔ گفت‌وگو"><Trash2 size={14} />پاک کردن گفت‌وگو</button>
    </nav>
  );
}
