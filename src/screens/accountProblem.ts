/** Why the account did not open the wallet, in words a person can act on: the lock screen's and Settings'. */
export function accountProblem(reason: 'wrong' | 'offline' | 'unreadable' | 'none'): string {
  if (reason === 'wrong')
    return 'That password does not open your wallet. If you reset it, sign in again and use your recovery kit.';
  if (reason === 'offline') return 'Wallet could not reach the server. Connect, and try again.';
  return 'That did not open your wallet.';
}
