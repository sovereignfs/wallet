'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, EmptyState } from '@sovereignfs/ui';
import { arrive } from '../keyring/resume';
import { type CoreKeySettings, coreKeys } from './core-client';

/**
 * Core's answer, read from the address (sdk §9.3): `receive()` takes it out of the fragment before anything else, checks it, and keeps the key for this
 * session; then the person goes back to where they were. A refusal is said, with a way to ask again. Nothing of the answer is sent anywhere. **Taking the answer
 * is the proof** the wallet then opens on without asking again (DESIGN.md §9.4), and only it: the arrival is marked here and nowhere before.
 */
export function KeyReturn(settings: CoreKeySettings) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    coreKeys(settings)
      .receive()
      .then((received) => {
        if (!received.ok) return setFailed(true);
        arrive();
        window.location.replace(received.returnPath);
      })
      .catch(() => setFailed(true));
    // Once, when the page opens: the answer is in the address only until it is read.
  }, []);

  if (!failed)
    return (
      <EmptyState icon="lock" heading="Unlocking your wallet…" description="Taking you back." />
    );
  return (
    <Alert variant="error">
      Your wallet could not be unlocked.{' '}
      <Button onClick={() => void coreKeys(settings).unlock('/')}>Try again</Button>{' '}
      <a href="/">Back to your wallet</a>
    </Alert>
  );
}
