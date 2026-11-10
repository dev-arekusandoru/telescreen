import { useEffect, useState } from "react";
import crab from "../art/summer/crab.svg";
import bee from "../art/summer/bee.svg";
import styles from "./summer.module.css";
import type { ThemeProps } from "../types";

const bubbles = Array.from({ length: 9 }, (_, i) => ({ left: `${(i * 37 + 8) % 96}%`, delay: `${-((i * 7) % 19)}s`, size: 15 + (i * 13) % 22 }));

export function Summer({ syncedAt }: ThemeProps) {
  const [wave, setWave] = useState(0);
  const [sync, setSync] = useState(syncedAt);
  useEffect(() => {
    if (sync === syncedAt) return;
    setSync(syncedAt);
    setWave((n) => n + 1);
  }, [syncedAt, sync]);
  return <>
    <div className={styles.sun} aria-hidden="true"><i /></div>
    {bubbles.map((b, i) => <span key={i} className={styles.bubble} style={{ left: b.left, animationDelay: b.delay, width: b.size, height: b.size }} />)}
    <img className={styles.crab} src={crab} alt="" />
    <span className={styles.ball} aria-hidden="true">🏖️</span>
    <img className={styles.bee} src={bee} alt="" />
    {wave > 0 && <div key={wave} className={styles.wave} aria-hidden="true" />}
  </>;
}
