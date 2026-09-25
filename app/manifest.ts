import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Campus Plug — Student Marketplace at UG',
    short_name: 'Campus Plug',
    description: 'The student marketplace for the University of Ghana community.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f8f8',
    theme_color: '#0f0f0f',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}
