/**
 * Wallet's mark: a wallet whose flap and clasp are cut out of it, in one path, in the colour of the text around it (`currentColor`), so that it follows
 * the theme. It says nothing to a screen reader unless it is given a `label`: beside the name, the name says it. The same shape is the app's icons
 * (`public/icons/icon.svg`), as a light mark on the dark tile.
 */
export function WalletMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 56"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10 6h38a6 6 0 0 1 6 6v4h2a6 6 0 0 1 6 6v22a8 8 0 0 1-8 8H10A8 8 0 0 1 2 44V14a8 8 0 0 1 8-8Zm0 6a2 2 0 0 0 0 4h38v-4H10Zm34 22a4 4 0 1 0 0 8h14V34H44Z"
      />
    </svg>
  );
}
