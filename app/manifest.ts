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
        src: '/favicon.ico',
        sizes: '64x64',
        type: 'image/x-icon',
      },
    ],
  }
}
