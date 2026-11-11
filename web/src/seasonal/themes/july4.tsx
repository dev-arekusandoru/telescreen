import { useEffect, useRef, useState } from "react";
import flag from "../art/july4/flag.svg";
import styles from "./july4.module.css";
import type { ThemeProps } from "../types";

const PARTICLES = 14;
// 8s cycle each; staggered so a burst is on screen most of the time. Kept out of the header (top ~60px).
const BURSTS = [
  { x: 24, y: 28, delay: 0 },
  { x: 60, y: 22, delay: 2 },
  { x: 40, y: 42, delay: 4 },
  { x: 80, y: 36, delay: 6 },
];
const FINALE = [
  { x: 20, y: 26, delay: 0 },
  { x: 50, y: 20, delay: 0.25 },
  { x: 78, y: 28, delay: 0.5 },
  { x: 36, y: 44, delay: 0.75 },
  { x: 66, y: 46, delay: 1 },
];

const Sparks = () =>
  Array.from({ length: PARTICLES }, (_, i) => <i key={i} className={styles.p} style={{ "--a": `${(i * 360) / PARTICLES}deg` } as React.CSSProperties} />);

export function July4({ syncedAt }: ThemeProps) {
  const [finale, setFinale] = useState(0);
  const lastSync = useRef(syncedAt);
  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    setFinale((n) => n + 1);
  }, [syncedAt]);

  return (
    <>
      {BURSTS.map((b, i) => (
        <div key={i} className={styles.fw} style={{ "--x": `${b.x}%`, "--y": `${b.y}%`, "--delay": `${b.delay}s` } as React.CSSProperties}>
          <i className={styles.rocket} />
          <Sparks />
        </div>
      ))}
      {finale > 0 && (
        <div key={finale} className={styles.once}>
          {FINALE.map((b, i) => (
            <div key={i} className={styles.fw} style={{ "--x": `${b.x}%`, "--y": `${b.y}%`, "--delay": `${b.delay}s` } as React.CSSProperties}>
              <Sparks />
            </div>
          ))}
        </div>
      )}
      <div className={styles.sparkler} />
    </>
  );
}

export function July4Logo() {
  return <img src={flag} alt="" className={styles.logo} />;
}
