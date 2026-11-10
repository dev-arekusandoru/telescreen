import { useEffect, useRef, useState } from "react";
import styles from "./newyear.module.css";
import type { ThemeProps } from "../types";

type Piece = { id: number; x: number; delay: number; duration: number; size: number; hue: number; kind: number };
const makePiece = (id: number): Piece => ({
  id,
  x: 4 + Math.random() * 92,
  delay: Math.random() * 2,
  duration: 5 + Math.random() * 6,
  size: 7 + Math.random() * 8,
  hue: [43, 48, 205, 215][Math.floor(Math.random() * 4)] ?? 43,
  kind: Math.floor(Math.random() * 3),
});
const initial = () => Array.from({ length: 22 }, (_, i) => makePiece(i));

export function NewYear({ syncedAt }: ThemeProps) {
  const [pileCount, setPileCount] = useState(10);
  const [pieces, setPieces] = useState<Piece[]>(initial);
  const [burst, setBurst] = useState(0);
  const [spark, setSpark] = useState(0);
  const nextId = useRef(22);
  const lastSync = useRef(syncedAt);

  useEffect(() => {
    const spawn = window.setInterval(() => {
      setPieces((current) => [...current, makePiece(nextId.current++)].slice(-48));
      setPileCount((count) => Math.min(36, count + 1));
    }, 1000);
    const pop = window.setInterval(() => setSpark((value) => value + 1), 4200);
    return () => { window.clearInterval(spawn); window.clearInterval(pop); };
  }, []);

  useEffect(() => {
    if (lastSync.current === syncedAt) return;
    lastSync.current = syncedAt;
    setPileCount(0);
    setPieces(Array.from({ length: 30 }, (_, i) => makePiece(nextId.current++)));
    setBurst((value) => value + 1);
  }, [syncedAt]);

  return (
    <>
      <div className={styles.lights} aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: `${i * 5.8}%`, animationDelay: `${(i % 6) * 0.31}s` }} />)}</div>
      <div className={styles.balloons} aria-hidden="true"><i /><i /><i /></div>
      {pieces.map((piece) => <i key={piece.id} className={`${styles.piece} ${styles[`kind${piece.kind}`]}`} style={{ left: `${piece.x}%`, width: piece.size, height: piece.size, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, color: `hsl(${piece.hue} 80% 48%)` }} />)}
      <div key={spark} className={styles.pop} style={{ left: `${16 + (spark * 37) % 68}%` }} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div key={burst} className={styles.burst} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div className={styles.pile} aria-hidden="true">{Array.from({ length: pileCount }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, bottom: `${(i * 11) % 13}px`, transform: `rotate(${(i * 53) % 150}deg)`, backgroundColor: `hsl(${[43, 48, 205, 215][i % 4]} 78% 55%)` }} />)}</div>
    </>
  );
}
