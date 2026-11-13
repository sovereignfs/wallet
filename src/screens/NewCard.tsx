'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, FormField, SegmentedControl, Textarea } from '@sovereignfs/ui';
import {
  type CameraProblem,
  cameraSupported,
  scanImageFile,
  startScanning,
} from '../barcode/camera';
import { newCard } from '../core/entries';
import { CardForm } from './CardForm';
import styles from './Cards.module.css';
import screens from './Screens.module.css';
import { useWallet } from './WalletProvider';

/**
 * Adding a card (DESIGN.md §13.2): point the camera at its code, choose a picture of it (a screenshot, a photo), or type what it says. **The camera asks
 * for permission only when scanning starts**, and refusing it, or having none, offers the others. A scan fills the code; the person names the card.
 */
type How = 'scan' | 'image' | 'type';

const PROBLEMS: Record<CameraProblem, string> = {
  denied:
    'The camera is not allowed. You can allow it for this site, choose a picture of the code, or type it.',
  none: 'No camera was found. Choose a picture of the code, or type it.',
  unsupported: 'This browser cannot use the camera. Choose a picture of the code, or type it.',
  in_use:
    'The camera is being used by something else. Close it, or choose a picture of the code, or type it.',
};

export function NewCard() {
  const router = useRouter();
  const { wallet } = useWallet();
  const [how, setHow] = useState<How>(cameraSupported() ? 'scan' : 'image');
  const [payload, setPayload] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (payload !== null) {
    return (
      <main className={screens.page}>
        <div className={`${screens.column} ${screens.narrow}`}>
          <h1 className={screens.heading}>Name your card</h1>
          <CardForm
            initial={newCard({ payload, title: '' })}
            submitLabel="Add card"
            onCancel={() => setPayload(null)}
            onSubmit={async (card) => {
              const position = Date.now();
              const id = await wallet.create({ ...card.shape, position }, card.body);
              router.replace(`/cards/${id}`);
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={screens.page}>
      <div className={`${screens.column} ${screens.narrow}`}>
        <h1 className={screens.heading}>Add a card</h1>
        <SegmentedControl
          aria-label="How to add it"
          value={how}
          onChange={(next) => {
            setNote(null);
            setHow(next);
          }}
          options={[
            { value: 'scan', label: 'Scan' },
            { value: 'image', label: 'Picture' },
            { value: 'type', label: 'Type' },
          ]}
        />
        {note ? <Alert variant="info">{note}</Alert> : null}
        {how === 'scan' ? (
          <Scanner
            onFound={setPayload}
            onProblem={(problem) => {
              setNote(PROBLEMS[problem]);
              setHow(problem === 'denied' || problem === 'in_use' ? 'image' : 'type');
            }}
          />
        ) : null}
        {how === 'image' ? <PictureFinder onFound={setPayload} /> : null}
        {how === 'type' ? <Typed onDone={setPayload} /> : null}
      </div>
    </main>
  );
}

function Scanner({
  onFound,
  onProblem,
}: {
  onFound: (text: string) => void;
  onProblem: (problem: CameraProblem) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  async function start() {
    if (!video.current) return;
    setStarted(true);
    try {
      const camera = await startScanning(video.current, (scanned) => onFound(scanned.text));
      stop.current = camera.stop;
    } catch (problem) {
      setStarted(false);
      onProblem(typeof problem === 'string' ? (problem as CameraProblem) : 'none');
    }
  }

  return (
    <div className={screens.stack}>
      <p className={screens.lead}>
        Point the camera at the card’s QR code. Nothing leaves your phone.
      </p>
      <div className={styles.scanner} hidden={!started}>
        <video ref={video} className={styles.video} aria-label="Camera" muted playsInline />
      </div>
      {!started ? (
        <div>
          <Button size="lg" onClick={() => void start()}>
            Start the camera
          </Button>
        </div>
      ) : (
        <p className={screens.muted}>Looking for a code…</p>
      )}
    </div>
  );
}

/** A picture of a code: chosen, pasted or dropped. */
function PictureFinder({ onFound }: { onFound: (text: string) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(file: Blob | undefined) {
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      const found = await scanImageFile(file);
      if (found) onFound(found.text);
      else setMessage('There is no QR code in that picture. Try a clearer one, or type the code.');
    } catch {
      setMessage('That picture could not be read.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) void read(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  return (
    <div
      className={screens.stack}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void read([...event.dataTransfer.files].find((f) => f.type.startsWith('image/')));
      }}
    >
      <p className={screens.lead}>
        Choose a picture of the code, such as a screenshot, or paste or drop one here.
      </p>
      {message ? <Alert variant="warning">{message}</Alert> : null}
      <label>
        <span className={screens.visuallyHidden}>Picture of the code</span>
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(event) => void read(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}

function Typed({ onDone }: { onDone: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className={screens.stack}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() !== '') onDone(text);
      }}
    >
      <p className={screens.lead}>Type or paste what the code says. It is drawn as a QR code.</p>
      <FormField label="What the code says">
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" disabled={text.trim() === ''}>
          Continue
        </Button>
      </div>
    </form>
  );
}
