import { Heart, LockKeyhole, Sparkles } from "lucide-react";
import { badges, faNumber } from "@/lib/chat";

export function AffectionBar({ value }: { value: number }) {
  return (
    <section className="affection" aria-label="دوستی با ریروکا">
      <div className="affection-title">
        <span><Heart size={16} aria-hidden="true" /> میزان دوستی</span>
        <strong>{faNumber.format(value)}<small> / ۱۰۰</small></strong>
      </div>
      <progress max={100} value={value} aria-label="میزان دوستی" />
      <ul className="badges" aria-label="نشان‌های دوستی">
        {badges.map((badge) => {
          const earned = value >= badge.at;
          return <li key={badge.at} data-earned={earned} title={earned ? badge.line : "باز شدن در امتیاز " + faNumber.format(badge.at)}>
            {earned ? <Sparkles size={12} aria-hidden="true" /> : <LockKeyhole size={11} aria-hidden="true" />}
            <span>{badge.label}<span className="sr-only">، {earned ? "باز شده" : "در امتیاز " + faNumber.format(badge.at)}</span></span>
          </li>;
        })}
      </ul>
    </section>
  );
}
