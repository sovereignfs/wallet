'use client';

import { useEffect, useState } from 'react';
import { formatKit } from '@sovereignfs/sdk/keys';
import { Alert, RecoveryKit } from '@sovereignfs/ui';
import { arrive } from '../keyring/resume';
import { walletVault } from './vault-client';

/**
 * The recovery kit, shown once (RFC 0001): 32 random bytes made here, shown as the SDK writes them, and given their way into the keys only once the person says
 * they kept it. It is the way back to the wallet after a forgotten password, and it is never sent anywhere. **Not yet audited.**
 */
export function KitScreen({ vaultId }: { vaultId: string }) {
  const [kit, setKit] = useState<{ bytes: Uint8Array; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const done = () => window.location.assign('/');

  useEffect(() => {
    void (async () => {
      if (!(await walletVault(vaultId).kitPending())) return done();
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      setKit({ bytes, text: await formatKit(bytes) });
    })();
    // Once, when the page opens: `done` and the vault are the same for the page's life.
  }, []);

  async function keep() {
    if (!kit) return;
    setContinuing(true);
    setProblem(null);
    if (await walletVault(vaultId).keepKit(kit.bytes)) {
      // Keeping a kit can take a while: the time to open the wallet without asking starts again here.
      arrive();
      return done();
    }
    setContinuing(false);
    setProblem('That could not be saved. Check your connection, and press Continue again.');
  }

  if (!kit) return null;
  return (
    <>
      <p>
        Wallet encrypts what you keep in it in your browser. If you forget your password, this kit
        is the way back to your wallet. It has not been independently audited yet.
      </p>
      {problem ? <Alert variant="error">{problem}</Alert> : null}
      <RecoveryKit
        kit={kit.text}
        instanceName="Wallet"
        onContinue={() => void keep()}
        continuing={continuing}
      />
    </>
  );
}
