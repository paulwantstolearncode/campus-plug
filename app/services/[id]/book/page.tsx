'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import { formatName } from '@/lib/formatName'

interface ServiceData {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  service_duration: string | null
  service_location: string | null
  seller: {
    id: string
    full_name: string | null
    whatsapp_number: string | null
  } | null
}

export default function BookServicePage() {
  const [service, setService] = useState<ServiceData | null>(null)
  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const rawId = params.id
  const serviceId = Array.isArray(rawId) ? rawId[0] : rawId

  useEffect(() => {
    async function loadService() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        if (!serviceId) {
          alert('Invalid service ID')
          router.push('/services')
          return
        }

        const { data } = await supabase
          .from('listings')
          .select('*, seller:profiles!seller_id (id, full_name, whatsapp_number)')
          .eq('id', serviceId)
          .eq('listing_type', 'service')
          .single()

        if (!data) {
          alert('Service not found')
          router.push('/services')
          return
        }

        setService(data as ServiceData)
      } catch (err) {
        // A failed auth/network lookup must not strand the page on the
        // loading screen forever.
        console.error('Failed to load service:', err)
        alert('Could not load the service. Please try again.')
        router.push('/services')
      } finally {
        setPageLoading(false)
      }
    }

    loadService()
  }, [serviceId, router])

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!service) {
      alert('Service data is not ready. Please refresh and try again.')
      return
    }

    if (!bookingDate || !bookingTime) {
      alert('Please pick a date and time')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // Guard: seller must exist and have a WhatsApp number before we create
      // the booking — otherwise we'd save an orphaned booking, then send the
      // buyer to wa.me/null.
      if (!service.seller?.id) {
        alert('The seller information is missing. Please try again later.')
        setLoading(false)
        return
      }

      if (!service.seller?.whatsapp_number) {
        alert('The seller has not set up their WhatsApp number. Please try again later.')
        setLoading(false)
        return
      }

      const { error } = await supabase
        .from('bookings')
        .insert({
          listing_id: serviceId,
          buyer_id: user.id,
          seller_id: service.seller.id,
          booking_date: bookingDate,
          booking_time: bookingTime,
          notes: notes || null,
        })

      if (error) {
        console.error(error)
        alert('Could not create booking. Please try again.')
        setLoading(false)
        return
      }

      const message = encodeURIComponent(
        'Hi! I just booked your service on Campus Plug 🔌\n\n' +
        '📋 Service: ' + service.title + '\n' +
        '📅 Date: ' + bookingDate + '\n' +
        '⏰ Time: ' + bookingTime + '\n' +
        '💰 Price: GH₵ ' + Number(service.price || 0).toLocaleString() + '\n' +
        (notes ? '📝 Notes: ' + notes + '\n\n' : '\n') +
        'Please confirm the booking and let me know payment details.'
      )

      const whatsappUrl = 'https://wa.me/' + service.seller.whatsapp_number + '?text=' + message

      alert('✅ Booking created!\n\nYou will be redirected to WhatsApp to confirm with ' + (service.seller.full_name ? formatName(service.seller.full_name) : 'the seller') + '.')

      window.location.href = whatsappUrl
    } catch (err) {
      console.error(err)
      alert('Something went wrong.')
      setLoading(false)
    }
  }

  if (pageLoading || !service) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading service...</p>
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <main className="min-h-screen bg-charcoal">
      {/* Nav */}
<NavBar back={{ href: '/services', label: 'Back to services' }} />

      {/* Hero */}
      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
        </div>

        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        ></div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">
            Book Now
          </div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
            Almost <span className="gradient-text">there</span>
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70">
            Pick your preferred time and confirm via WhatsApp.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="relative pb-24 md:pb-32 bg-off-white -mt-8">
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">

          <div className="grid lg:grid-cols-5 gap-6">

            {/* LEFT — Service Card (2 cols) */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">

                  {/* Service Image */}
                  <div className="relative aspect-square overflow-hidden bg-gray-100">
                    {service.image_url ? (
                      <Image
                        src={service.image_url}
                        alt={service.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 40vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-charcoal via-gray-800 to-charcoal">
                        <span className="text-7xl opacity-40">💼</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-charcoal/60 to-transparent"></div>

                    <div className="absolute top-4 left-4 glass px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-gold rounded-full"></span>
                      Service
                    </div>

                    <div className="absolute top-4 right-4 bg-gold text-charcoal px-3 py-1.5 rounded-full text-sm font-bold shadow-lg">
                      GH₵ {Number(service.price || 0).toLocaleString()}
                    </div>
                  </div>

                  {/* Service Info */}
                  <div className="p-6">
                    <h2 className="text-xl font-bold text-charcoal mb-3">
                      {service.title}
                    </h2>

                    {service.seller?.full_name && (
                      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center font-bold text-gold-dark">
                          {formatName(service.seller.full_name).charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-charcoal text-sm">{formatName(service.seller.full_name)}</p>
                          <p className="text-xs text-gray-500">Seller</p>
                        </div>
                      </div>
                    )}

                    {service.description && (
                      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                        {service.description}
                      </p>
                    )}

                    <div className="space-y-2">
                      {service.service_duration && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">⏱</span>
                          <span>{service.service_duration}</span>
                        </div>
                      )}
                      {service.service_location && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">📍</span>
                          <span>{service.service_location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT — Booking Form (3 cols) */}
            <div className="lg:col-span-3">
              <form
                onSubmit={handleBooking}
                className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 border border-gray-100 space-y-6"
              >
                {/* Header */}
                <div>
                  <h2 className="text-2xl font-bold text-charcoal mb-1">
                    Booking Details
                  </h2>
                  <p className="text-sm text-gray-500">
                    Pick when you&apos;d like the service.
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                    Preferred Date *
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">
                      📅
                    </span>
                    <input
                      type="date"
                      min={today}
                      className="w-full pl-14 pr-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Time */}
                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                    Preferred Time *
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">
                      ⏰
                    </span>
                    <input
                      type="time"
                      className="w-full pl-14 pr-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                    Notes <span className="text-gray-400 font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    placeholder="Any special requests, location details, or questions..."
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors resize-none"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* How it works */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-green-50 to-transparent border border-green-100">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-lg shrink-0 shadow-lg shadow-green-500/30">
                      💬
                    </div>
                    <div>
                      <p className="font-bold text-charcoal text-sm mb-1">What happens next</p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Your booking is saved and you&apos;ll be sent to WhatsApp to confirm with the seller and arrange payment.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-charcoal text-white py-5 rounded-2xl font-bold text-lg hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-charcoal/25 flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <span>Booking...</span>
                  ) : (
                    <>
                      <span>📅 Book & Message on WhatsApp</span>
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </>
                  )}
                </button>

                {/* Trust indicators */}
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-gray-500 pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gold">✓</span> Free to book
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gold">✓</span> No commitment
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gold">✓</span> Direct contact
                  </div>
                </div>

              </form>
            </div>

          </div>
        </div>
      </section>
    </main>
  )
}
