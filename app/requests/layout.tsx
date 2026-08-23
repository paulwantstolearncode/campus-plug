import { Metadata } from 'next'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Wanted Board — Campus Plug',
  description: 'Need something specific on campus? Put it on the Wanted Board and sellers will pitch you directly on WhatsApp. Campus Plug — University of Ghana student marketplace.',
  openGraph: {
    title: 'Wanted Board — Campus Plug',
    description: 'Need something specific on campus? Put it on the Wanted Board and sellers will pitch you directly on WhatsApp.',
    url: `${SITE_URL}/requests`,
    siteName: 'Campus Plug',
    locale: 'en_GH',
    type: 'website',
    images: [
      {
        url: `${SITE_URL}/api/og?title=Wanted+Board%3A+Request+a+Plug&location=University+of+Ghana&category=Student+Requests`,
        width: 1200,
        height: 630,
        alt: 'Wanted Board — Campus Plug',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wanted Board — Campus Plug',
    description: 'Need something specific on campus? Put it on the Wanted Board and sellers will pitch you directly on WhatsApp.',
    images: [`${SITE_URL}/api/og?title=Wanted+Board%3A+Request+a+Plug&location=University+of+Ghana&category=Student+Requests`],
  },
}

export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
