import { useEffect, useState } from "react";
import crab from "../art/summer/crab.svg";
import bee from "../art/summer/bee.svg";
import styles from "./summer.module.css";
import type { ThemeProps } from "../types";

const bubbles = Array.from({ length: 9 }, (_, i) => ({ left: `${(i * 37 + 8) % 96}%`, delay: `${-((i * 7) % 19)}s`, size: 15 + (i * 13) % 22 }));

export function SummerLogo() {
  return <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
    <circle cx="24" cy="24" r="11" fill="#ffd96a" />
    <circle cx="24" cy="24" r="18" fill="none" stroke="#f7a64e" strokeWidth="3" strokeDasharray="2 5" />
    <circle cx="24" cy="24" r="8" fill="#ffe58a" />
  </svg>;
}

export function Summer({ syncedAt }: ThemeProps) {
  const [wave, setWave] = useState(0);
  const [sync, setSync] = useState(syncedAt);
  useEffect(() => {
    if (sync === syncedAt) return;
    setSync(syncedAt);
    setWave((n) => n + 1);
  }, [syncedAt, sync]);
  return <>
    {bubbles.map((b, i) => <span key={i} className={styles.bubble} style={{ left: b.left, animationDelay: b.delay, width: b.size, height: b.size }} />)}
    <img className={styles.crab} src={crab} alt="" />
    <img className={styles.bee} src={bee} alt="" />
    {wave > 0 && <svg key={wave} className={styles.wave} viewBox="0 0 2400 70" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 26 C150 2 260 54 410 27 S680 7 820 29 S1060 51 1200 20 S1460 3 1610 29 S1880 51 2020 27 S2260 6 2400 26 V70 H0Z" fill="#64cce4" fillOpacity=".58" />
      <path d="M0 36 C170 13 280 64 440 37 S700 18 850 39 S1080 58 1200 33 S1460 12 1630 38 S1900 58 2050 36 S2280 17 2400 35 V70 H0Z" fill="#65d9d0" fillOpacity=".42" />
      <path d="M0 26 C150 2 260 54 410 27 S680 7 820 29 S1060 51 1200 20 S1460 3 1610 29 S1880 51 2020 27 S2260 6 2400 26" fill="none" stroke="#e8ffff" strokeOpacity=".85" strokeWidth="5" />
    </svg>}
  </>;
}
