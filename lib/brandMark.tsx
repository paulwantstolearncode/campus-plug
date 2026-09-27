/**
 * Campus Plug "Plug Bag" brand mark — single source of truth.
 *
 * The motif: an obsidian-filled shopping bag (zinc #18181b front panel) with a
 * gold (#c9a227) zap bolt on it. Used by every icon surface:
 *
 *   app/icon.tsx        32×32 tab favicon   (strokeWidth 2 for legibility)
 *   app/apple-icon.tsx  180×180 iOS icon    (default stroke)
 *   app/icon-192/route  192×192 PWA "any maskable"
 *   app/icon-512/route  512×512 PWA maskable
 *
 * Tweak the mark HERE and every surface updates together.
 */
export function PlugBagMark({ size, strokeWidth = 1.8 }: { size: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c9a227"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Shopping Bag Outline */}
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" fill="#18181b" />
      <line x1="3" y1="6" x2="21" y2="6" />
      {/* Bag Handle */}
      <path d="M16 10a4 4 0 0 1-8 0" strokeWidth={strokeWidth + 0.2} />
      {/* Gold Electric Plug / Zap Symbol on Front */}
      <path d="M13 11L9 17h4l-1 4 5-6h-4l1-4z" fill="#c9a227" stroke="#c9a227" strokeWidth={1} />
    </svg>
  );
}
