'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@sovereignfs/ui';
import styles from './Undo.module.css';

/**
 * Every delete offers Undo for ten seconds (DESIGN.md §26.5), and so does a merge that kept this device's value over another's (§11.5). One bar at the foot
 * of the screen; a new offer replaces the last. What Undo does is the caller's: for a delete it writes the entry back, which is an ordinary change.
 */
interface Offer {
  readonly message: string;
  readonly undo: () => void | Promise<void>;
}

const Context = createContext<((offer: Offer) => void) | null>(null);

export const UNDO_MS = 10_000;

export function useUndo(): (offer: Offer) => void {
  const offer = useContext(Context);
  if (!offer) throw new Error('no undo here');
  return offer;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Offer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const offer = useCallback((next: Offer) => {
    clearTimeout(timer.current);
    setCurrent(next);
    timer.current = setTimeout(() => setCurrent(null), UNDO_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Context.Provider value={offer}>
      {children}
      {current ? (
        <div className={styles.bar} role="status" aria-live="polite">
          <span>{current.message}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              clearTimeout(timer.current);
              const { undo } = current;
              setCurrent(null);
              void undo();
            }}
          >
            Undo
          </Button>
        </div>
      ) : null}
    </Context.Provider>
  );
}
