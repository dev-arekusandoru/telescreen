import { useEffect, useRef, useState } from "react";
import clover from "../art/stpatricks/four-leaf-clover.svg";
import coin from "../art/stpatricks/coin.svg";
import styles from "./stpatricks.module.css";
import type { ThemeProps } from "../types";

type Drop = { id: number; x: number; size: number; duration: number; delay: number; clover: boolean };
const makeDrop = (id: number): Drop => ({ id, x: (id * 0.618034 * 100) % 96, size: 17 + (id * 7) % 13, duration: 8 + (id * 3) % 7, delay: id < 7 ? -id * 1.7 : 0, clover: id % 3 === 0 });

export function StPatricksLogo() {
  return <svg className={styles.logo} viewBox="0 0 48 44" aria-hidden="true">
    <path d="M5 39a19 19 0 0 1 38 0" fill="none" stroke="#f2c94c" strokeWidth="5" />
    <path d="M10 39a14 14 0 0 1 28 0" fill="none" stroke="#53a56b" strokeWidth="4" />
    <path d="M15 39a9 9 0 0 1 18 0" fill="none" stroke="#d88db0" strokeWidth="3.5" />
    <path d="M0 39c0-3 2-5 5-5 1-4 8-4 9 0 3 0 4 2 4 5zm30 0c0-3 2-5 5-5 1-4 8-4 9 0 3 0 4 2 4 5z" fill="#fff" />
  </svg>;
}

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
    <span className={styles.pot} aria-hidden="true">☘</span>
  </>;
}
