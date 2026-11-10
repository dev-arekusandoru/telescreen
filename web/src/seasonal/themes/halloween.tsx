import { useEffect, useRef, useState } from "react";
import bat from "../art/halloween/bat.svg";
import ghost from "../art/halloween/ghost.svg";
import pumpkin from "../art/halloween/jack-o-lantern.svg";
import spider from "../art/halloween/spider.svg";
import styles from "./halloween.module.css";
import type { ThemeProps } from "../types";

type Bat = { id: number; y: number; delay: number; duration: number };
type Ghost = { id: number; x: number; delay: number };
const initialBats: Bat[] = Array.from({ length: 3 }, (_, id) => ({ id, y: 12 + id * 14, delay: -id * 7, duration: 19 + id * 3 }));

export function Halloween({ syncedAt }: ThemeProps) {
  const [bats, setBats] = useState(initialBats);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [finale, setFinale] = useState(0);
  const nextId = useRef(3);
  const lastSync = useRef(syncedAt);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const id = nextId.current++;
      setBats((items) => [...items.slice(-2), { id, y: 10 + Math.random() * 34, delay: 0, duration: 17 + Math.random() * 8 }]);
      setGhosts((items) => [...items.slice(-2), { id, x: 8 + Math.random() * 84, delay: 0 }]);
    }, 6200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    setFinale((n) => n + 1);
    setBats((items) => items.map((bat) => ({ ...bat, delay: 0, y: 5 + Math.random() * 35 })));
  }, [syncedAt]);

  return (
    <>
      <div className={styles.web} aria-hidden="true" />
      <div className={styles.webRight} aria-hidden="true" />
      {bats.map((item) => <img key={item.id} src={bat} alt="" className={`${styles.bat} ${finale ? styles.scatter : ""}`} style={{ "--y": `${item.y}vh`, "--delay": `${item.delay}s`, "--duration": `${item.duration}s` } as React.CSSProperties} />)}
      {ghosts.map((item) => <img key={item.id} src={ghost} alt="" className={styles.ghost} style={{ "--x": `${item.x}%`, "--delay": `${item.delay}s` } as React.CSSProperties} />)}
      <span className={styles.thread} aria-hidden="true"><img src={spider} alt="" /></span>
      <img src={pumpkin} alt="" className={styles.pumpkin} />
      <img src={pumpkin} alt="" className={styles.walker} />
      <span key={finale} className={styles.syncFlock} aria-hidden="true">{finale > 0 && <>{[0, 1, 2, 3, 4].map((n) => <img key={n} src={bat} alt="" style={{ "--n": n } as React.CSSProperties} />)}</>}</span>
    </>
  );
}
