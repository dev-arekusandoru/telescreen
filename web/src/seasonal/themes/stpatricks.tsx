import { useEffect, useRef, useState } from "react";
import clover from "../art/stpatricks/four-leaf-clover.svg";
import coin from "../art/stpatricks/coin.svg";
import styles from "./stpatricks.module.css";
import type { ThemeProps } from "../types";

type Drop = { id: number; x: number; size: number; duration: number; delay: number; clover: boolean };
const makeDrop = (id: number): Drop => ({ id, x: (id * 0.618034 * 100) % 96, size: 17 + (id * 7) % 13, duration: 8 + (id * 3) % 7, delay: id < 7 ? -id * 1.7 : 0, clover: id % 3 === 0 });

export function StPatricks({ syncedAt }: ThemeProps) {
  const [drops, setDrops] = useState(() => Array.from({ length: 7 }, (_, i) => makeDrop(i)));
  const [coins, setCoins] = useState<number[]>([]);
  const [scatter, setScatter] = useState(false);
  const next = useRef(7);
  const lastSync = useRef(syncedAt);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setDrops((items) => [...items, makeDrop(next.current++)]);
    }, 1900);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    setCoins([]);
    setScatter(true);
    const timer = window.setTimeout(() => setScatter(false), 1100);
    return () => window.clearTimeout(timer);
  }, [syncedAt]);

  return <>
    {drops.map((drop) => <span key={drop.id} className={`${styles.drop} ${drop.clover ? styles.clover : styles.fallingCoin}`} style={{ "--x": `${drop.x}vw`, "--size": `${drop.size}px`, "--duration": `${drop.duration}s`, "--delay": `${drop.delay}s` } as React.CSSProperties} onAnimationEnd={() => { if (!drop.clover) setCoins((pile) => [...pile, drop.id].slice(-120)); }}><img src={drop.clover ? clover : coin} alt="" /></span>)}
    {coins.map((id, i) => <img key={id} src={coin} alt="" className={`${styles.piledCoin} ${scatter ? styles.scatter : ""}`} style={{ "--left": `${(id * 37) % 96}%`, "--rise": `${(i % 4) * 5}px`, "--scatter": `${(id % 2 ? 1 : -1) * (38 + id % 24)}px` } as React.CSSProperties} />)}
    <svg className={styles.rainbow} viewBox="0 0 220 110" aria-hidden="true"><path d="M8 108A102 102 0 0 1 212 108" fill="none" stroke="#f2c94c" strokeWidth="10"/><path d="M22 108A88 88 0 0 1 198 108" fill="none" stroke="#53a56b" strokeWidth="9"/><path d="M37 108A73 73 0 0 1 183 108" fill="none" stroke="#80c8a2" strokeWidth="8"/><path d="M52 108A58 58 0 0 1 168 108" fill="none" stroke="#d88db0" strokeWidth="7"/></svg>
    <span className={styles.pot} aria-hidden="true">☘</span>
    {drops.map((drop) => <span key={drop.id} className={`${styles.drop} ${drop.clover ? styles.clover : styles.fallingCoin}`} style={{ "--x": `${drop.x}vw`, "--size": `${drop.size}px`, "--duration": `${drop.duration}s`, "--delay": `${drop.delay}s` } as React.CSSProperties} onAnimationEnd={() => { setDrops((items) => items.filter((item) => item.id !== drop.id)); if (!drop.clover) setCoins((pile) => [...pile, drop.id].slice(-120)); }}><img src={drop.clover ? clover : coin} alt="" /></span>)}
  </>;
}
