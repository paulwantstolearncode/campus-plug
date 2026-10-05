import { ImageResponse } from 'next/og';
import BrandMark from '@/lib/brandMark';

export const runtime = 'edge';

// 512x512 maskable PWA icon. Maskable icons must keep all meaningful content
// inside the inner 80% safe zone (Android launchers crop into circles,
// squircles, and rounded squares), so the mark is drawn small and centered on
// a full-bleed obsidian field — no border, no corner radius.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f0f0f',
        }}
      >
        <BrandMark size={290} />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
