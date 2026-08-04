'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function BookServicePage() {
  const [service, setService] = useState<any>(null)
  const [bookingDate, setBookingDate] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const serviceId = params.id as string

  useEffect(() => {
    async function loadService() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('listings')
        .select(`
          *,
          seller:profiles!seller_id (
            id,
            full_name,
            whatsapp_number
          )
        `)
        .eq('id', serviceId)
        .eq('listing_type', 'service')
        .single()

      if (!data) {
        alert('Service not found')
        router.push('/services')
        return
      }

      setService(data)
      setPageLoading(false)
    }

    loadService()
  }, [serviceId, router])

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault()

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

      // Save booking to database
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          listing_id: serviceId,
          buyer_id: user.id,
          seller_id: service.seller.id,
          booking_date: bookingDate,
          booking_time: bookingTime,
          notes: notes || null,
        })
        .select()
        .single()

      if (error) {
        console.error(error)
        alert('Could not create booking. Please try again.')
        setLoading(false)
        return
      }

      // Build WhatsApp message
      const message = encodeURIComponent(
        `Hi! I just booked your service on Campus Plug 🔌\n\n` +
        `📋 Service: ${service.title}\n` +
        `📅 Date: ${bookingDate}\n` +
        `⏰ Time: ${bookingTime}\n` +
        `💰 Price: GH₵ ${service.price}\n` +
        (notes ? `📝 Notes: ${notes}\n\n` : '\n') +
        `Please confirm the booking and let me know payment details.`
      )

      const whatsappUrl = `https://wa.me/${service.seller.whatsapp_number}?text=${message}`

      alert(`✅ Booking created!\n\nYou'll now be redirected to WhatsApp to confirm with ${service.seller.full_name}.`)

      // Redirect to WhatsApp
      window.location.href = whatsappUrl
    } catch (err) {
      console.error(err)
      alert('Something went wrong.')
      setLoading(false)
    }
  }

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  // Get today's date for min date
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        <div className="flex items-center gap-4 mb-6 mt-4">
          <Link href="/services" className="text-blue-600 hover:underline text-sm">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-black">Book Service</h1>
        </div>

        {/* Service Summary */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
          <div className="flex gap-4">
            {service.image_url ? (
              <img
                src={service.image_url}
                alt={service.title}
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : (
              <div className="w-24 h-24 bg-green-100 rounded-lg flex items-center justify-center text-3xl">
                💼
              </div>
            )}

            <div className="flex-1">
              <h2 className="font-bold text-lg text-black">{service.title}</h2>
              <p className="text-gray-500 text-sm">{service.seller?.full_name}</p>
              <p className="text-green-600 font-bold text-xl mt-1">
                GH₵ {Number(service.price).toLocaleString()}
              </p>
            </div>
          </div>

          {service.service_duration && (
            <p className="text-sm text-gray-600 mt-3">⏱ Duration: {service.service_duration}</p>
          )}
          {service.service_location && (
            <p className="text-sm text-gray-600">📍 Location: {service.service_location}</p>
          )}
        </div>

        {/* Booking Form */}
        <form
          onSubmit={handleBooking}
          className="bg-white rounded-xl shadow-sm p-6 flex flex-col gap-5"
        >
          <h3 className="font-semibold text-black">Booking Details</h3>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Preferred Date *
            </label>
            <input
              type="date"
              min={today}
              className="w-full border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-green-500"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Preferred Time *
            </label>
            <input
              type="time"
              className="w-full border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-green-500"
              value={bookingTime}
              onChange={(e) => setBookingTime(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              placeholder="Any special requests or details..."
              className="w-full border p-3 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              💡 After booking, you'll be sent to WhatsApp to confirm with the seller and arrange payment.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white p-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? 'Booking...' : '📅 Book & Message on WhatsApp'}
          </button>
        </form>
      </div>
    </div>
  )
}