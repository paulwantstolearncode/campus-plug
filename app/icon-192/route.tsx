import { ImageResponse } from 'next/og';
import BrandMark from '@/lib/brandMark';

export const runtime = 'edge';

// 192x192 PWA icon serving the "any maskable" dual purpose: declared so
// Android launchers stop upscaling the 180px apple icon, and drawn small
// enough (mark well inside the inner safe zone) to survive circular masks.
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
        <BrandMark size={136} />
      </div>
    ),
    { width: 192, height: 192 }
  );
}
