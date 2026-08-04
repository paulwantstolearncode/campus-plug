'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Service {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  service_duration: string | null
  service_location: string | null
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    async function loadServices() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      const { data } = await supabase
        .from('listings')
        .select(`
          *,
          seller:profiles!seller_id (
            full_name,
            whatsapp_number
          )
        `)
        .eq('listing_type', 'service')
        .order('created_at', { ascending: false })

      if (data) setServices(data as any)
      setLoading(false)
    }

    loadServices()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading services...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white shadow-sm p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            ← Back to Campus Plug
          </Link>
          <h1 className="text-xl font-bold text-black">💼 Services</h1>
          <div className="w-24"></div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 mt-6">

        {services.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-16 text-center">
            <p className="text-4xl mb-4">💼</p>
            <p className="text-gray-500 text-lg">No services available yet</p>
            <p className="text-gray-400 text-sm mt-2">
              Check back soon or become a seller to offer your services!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.id}
                className="bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Image */}
                {service.image_url ? (
                  <img
                    src={service.image_url}
                    alt={service.title}
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div className="w-full h-48 bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center">
                    <span className="text-4xl">💼</span>
                  </div>
                )}

                {/* Info */}
                <div className="p-4">
                  <h2 className="font-bold text-lg text-black">{service.title}</h2>

                  {service.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                      {service.description}
                    </p>
                  )}

                  {/* Service details */}
                  <div className="mt-3 space-y-1 text-xs text-gray-600">
                    {service.service_duration && (
                      <p>⏱ {service.service_duration}</p>
                    )}
                    {service.service_location && (
                      <p>📍 {service.service_location}</p>
                    )}
                    {service.seller?.full_name && (
                      <p>👤 {service.seller.full_name}</p>
                    )}
                  </div>

                  <p className="text-green-600 font-bold text-xl mt-3">
                    GH₵ {Number(service.price || 0).toLocaleString()}
                  </p>

                  {/* Book Now Button */}
                  <Link
                    href={`/services/${service.id}/book`}
                    className="mt-4 flex items-center justify-center gap-2 bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm"
                  >
                    📅 Book Now
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}