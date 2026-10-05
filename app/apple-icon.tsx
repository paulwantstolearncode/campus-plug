import { ImageResponse } from 'next/og';
import BrandMark from '@/lib/brandMark';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f0f0f',
          border: '4px solid #c9a227',
        }}
      >
        <BrandMark size={156} />
      </div>
    ),
    { ...size }
  );
}
