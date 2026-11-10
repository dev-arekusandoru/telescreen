import { useEffect, useRef, useState } from "react";
import bunny from "../art/easter/bunny.svg";
import chick from "../art/easter/chick.svg";
import egg from "../art/easter/egg.svg";
import styles from "./easter.module.css";
import type { ThemeProps } from "../types";

type Egg = { x: number; size: number; turn: number };
const eggHunt = (): Egg[] => Array.from({ length: 9 }, (_, i) => ({
  x: 4 + ((i * 37 + Math.random() * 13) % 92),
  size: 19 + Math.floor(Math.random() * 12),
  turn: Math.floor(Math.random() * 36 - 18),
}));

export function Easter({ syncedAt }: ThemeProps) {
  const [eggs, setEggs] = useState(eggHunt);
  const [pip, setPip] = useState(0);
  const lastSync = useRef(syncedAt);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    setEggs(eggHunt());
  }, [syncedAt]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setPip((n) => n + 1), 4200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      {eggs.map((item, i) => (
        <img key={`${i}-${item.x}`} src={egg} alt="" className={styles.egg} style={{ "--x": `${item.x}%`, "--size": `${item.size}px`, "--turn": `${item.turn}deg`, "--delay": `${i * -0.31}s` } as React.CSSProperties} />
      ))}
      <img src={bunny} alt="" className={styles.bunny} />
      {[0, 1].map((i) => (
        <img key={i} src={chick} alt="" className={`${styles.chick} ${i ? styles.chickTwo : ""} ${pip % 2 === i ? styles.pipping : ""}`} />
      ))}
      <span className={styles.tulip} aria-hidden="true">🌷</span>
    </>
  );
}
