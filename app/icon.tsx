import { ImageResponse } from 'next/og';
import BrandMark from '@/lib/brandMark';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: '7px',
          border: '1px solid rgba(201, 162, 39, 0.6)',
        }}
      >
        <BrandMark size={28} />
      </div>
    ),
    { ...size }
  );
}
