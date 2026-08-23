'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/format'
import { getCategoriesByType } from '@/lib/categories'
import { CAMPUS_LOCATIONS } from '@/lib/campusLocations'

const MAX_PHOTOS = 5
const MAX_FILE_MB = 5

interface ImageInput {
  file?: File // new local file to upload
  url: string // public URL or blob preview
}

interface ItemInput {
  name: string
  price: string
  duration: string
  description: string
}

function NewListingContent() {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<ImageInput[]>([])
  const [items, setItems] = useState<ItemInput[]>([])
  const [loading, setLoading] = useState(false)
  const [listingType, setListingType] = useState<'product' | 'service'>('product')
  const [category, setCategory] = useState('')
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [campusLocation, setCampusLocation] = useState('')
  const [campusLocationError, setCampusLocationError] = useState<string | null>(null)
  const [serviceDuration, setServiceDuration] = useState('')
  const [serviceLocation, setServiceLocation] = useState('')
  const [checking, setChecking] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')

  // Always-current blob URLs so we can revoke them on unmount without a
  // stale closure (every object URL created here must be released).
  const imagesRef = useRef<ImageInput[]>([])
  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => {
        if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url)
      })
    }
  }, [])

  // The URLs of photos that existed on disk when the listing was loaded (edit
  // mode). Used to detect which photos were dropped so their storage files
  // can be cleaned up best-effort after saving.
  const initialExistingImageUrls = useRef<string[]>([])

  useEffect(() => {
    async function initialize() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_seller')
          .eq('id', user.id)
          .single()

        if (!profile?.is_seller) {
          alert('You need to become a seller first. Add your WhatsApp number to start selling!')
          router.push('/become-seller')
          return
        }

        // If editing, load the existing listing + its photos and bundle items
        if (editId) {
          setIsEditMode(true)
          const { data: listing } = await supabase
            .from('listings')
            .select('*, listing_images (id, image_url, display_order), listing_items (name, price, description, duration, display_order)')
            .eq('id', editId)
            .eq('seller_id', user.id)
            .single()

          if (!listing) {
            alert('Listing not found or you don\'t have permission to edit it.')
            router.push('/')
            return
          }

          const typed = listing as unknown as {
            title: string
            price: number
            description: string | null
            listing_type: string
            category: string | null
            campus_location: string | null
            service_duration: string | null
            service_location: string | null
            listing_images: { id: string; image_url: string; display_order: number }[] | null
            listing_items: { name: string; price: number; description: string | null; duration: string | null; display_order: number }[] | null
          }

          setTitle(typed.title)
          setPrice(String(typed.price))
          setDescription(typed.description || '')
          setListingType(typed.listing_type as 'product' | 'service')
          setCategory(typed.category || '')
          setCampusLocation(typed.campus_location || '')
          setServiceDuration(typed.service_duration || '')
          setServiceLocation(typed.service_location || '')

          if (typed.listing_images && typed.listing_images.length > 0) {
            const sorted = [...typed.listing_images].sort(
              (a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id)
            )
            const existingUrls = sorted.map((img) => img.image_url)
            initialExistingImageUrls.current = existingUrls
            setImages(existingUrls.map((url) => ({ url })))
          }

          if (typed.listing_items && typed.listing_items.length > 0) {
            const sorted = [...typed.listing_items].sort(
              (a, b) => a.display_order - b.display_order
            )
            setItems(sorted.map((item) => ({
              name: item.name,
              price: String(item.price),
              duration: item.duration || '',
              description: item.description || '',
            })))
          }
        }
      } catch (err) {
        // A failed auth/profile/listing lookup must not strand the page on
        // the loading screen forever.
        console.error('Could not initialize listing form:', err)
        router.push('/login')
        return
      }

      // Only reached when we're keeping the visitor here.
      setChecking(false)
    }

    initialize()
  }, [router, editId])

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const room = MAX_PHOTOS - images.length
    if (room <= 0) {
      alert('You can add up to ' + MAX_PHOTOS + ' photos per listing.')
      return
    }

    const accepted: ImageInput[] = []
    for (const file of files) {
      if (accepted.length >= room) break
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        alert('"' + file.name + '" is over ' + MAX_FILE_MB + 'MB and was skipped.')
        continue
      }
      if (!file.type.startsWith('image/')) continue
      accepted.push({ file, url: URL.createObjectURL(file) })
    }

    if (accepted.length > 0) {
      setImages((prev) => [...prev, ...accepted].slice(0, MAX_PHOTOS))
    }

    // Allow re-picking the same file after a failed/partial selection.
    e.target.value = ''
  }

  const removeImage = (idx: number) => {
    const img = images[idx]
    if (img?.url.startsWith('blob:')) URL.revokeObjectURL(img.url)
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return
    setImages((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const updateItem = (idx: number, patch: Partial<ItemInput>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  // When bundle items exist, the listing's price is derived from the cheapest
  // item; the manual price field only applies to single (non-bundle) listings.
  const derivedPrice = (() => {
    const values = items
      .map((item) => Number(item.price))
      .filter((n) => !Number.isNaN(n) && n >= 0)
    return values.length > 0 ? Math.min(...values) : null
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title) {
      alert('Title is required')
      return
    }

    if (!category) {
      // Defensive guard — the native `required` on the select normally blocks
      // empty submits before this runs. Inline message (not alert), matching
      // the login form's validation pattern.
      setCategoryError('Please choose a category')
      return
    }

    if (!campusLocation) {
      setCampusLocationError('Please choose your location')
      return
    }

    if (items.length === 0 && !price) {
      alert('Title and price are required')
      return
    }

    for (const item of items) {
      if (!item.name.trim()) {
        alert('Every bundle item needs a name')
        return
      }
      if (item.price === '' || Number.isNaN(Number(item.price)) || Number(item.price) < 0) {
        alert('Every bundle item needs a valid price')
        return
      }
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert('You must be logged in')
        setLoading(false)
        return
      }

      // Upload new photos to storage (only the ones not yet in storage).
      const finalImages = [...images]
      for (let i = 0; i < finalImages.length; i++) {
        const img = finalImages[i]
        if (!img.file) continue

        const rawExt = (img.file.name.split('.').pop() || '').toLowerCase()
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(rawExt)
          ? rawExt
          : 'jpg'
        const fileName = user.id + '-' + Date.now() + '-' + i + '.' + safeExt

        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(fileName, img.file)

        if (uploadError) {
          alert('Image upload failed: ' + uploadError.message)
          setLoading(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from('listing-images')
          .getPublicUrl(fileName)

        finalImages[i] = { url: urlData.publicUrl }
      }

      const finalPrice = derivedPrice ?? Number(price)

      const payload = {
        title,
        price: finalPrice,
        description,
        image_url: finalImages.length > 0 ? finalImages[0].url : null,
        listing_type: listingType,
        category,
        campus_location: campusLocation,
        service_duration: listingType === 'service' ? serviceDuration : null,
        service_location: listingType === 'service' ? serviceLocation : null,
      }

      let listingId: string | null = null

      if (isEditMode && editId) {
        // UPDATE existing listing — reset to pending review after edit
        const { error } = await supabase
          .from('listings')
          .update({ ...payload, approval_status: 'pending' })
          .eq('id', editId)
          .eq('seller_id', user.id)

        if (error) {
          alert(error.message)
          setLoading(false)
          return
        }
        listingId = editId

        // Best-effort: remove storage files for photos that were dropped
        // since the listing was loaded (initial set minus what survives).
        const removedUrls = initialExistingImageUrls.current.filter(
          (url) => !finalImages.some((f) => f.url === url)
        )
        const marker = '/listing-images/'
        for (const url of removedUrls) {
          const markerIndex = url.indexOf(marker)
          if (markerIndex !== -1) {
            const fileName = url.slice(markerIndex + marker.length).split('?')[0]
            if (fileName) {
              try {
                await supabase.storage.from('listing-images').remove([fileName])
              } catch {
                // Non-fatal: the row deletion below is the source of truth.
              }
            }
          }
        }
      } else {
        // CREATE new listing — starts as pending
        const { data: inserted, error } = await supabase
          .from('listings')
          .insert({
            ...payload,
            seller_id: user.id,
            approval_status: 'pending',
          })
          .select('id')
          .single()

        if (error) {
          alert(error.message)
          setLoading(false)
          return
        }
        listingId = inserted?.id || null
      }

      if (listingId) {
        // Replace photos: delete old rows (edit) then insert the current set.
        if (isEditMode) {
          await supabase.from('listing_images').delete().eq('listing_id', listingId)
        }
        if (finalImages.length > 0) {
          const { error: imgError } = await supabase
            .from('listing_images')
            .insert(finalImages.map((img, i) => ({
              listing_id: listingId,
              image_url: img.url,
              display_order: i,
            })))
          if (imgError) {
            console.error('Could not save listing photos:', imgError)
            alert('⚠️ Your listing was saved but its photos could not be stored: ' + imgError.message)
          }
        }

        // Replace bundle items: delete old rows (edit) then insert the current set.
        if (isEditMode) {
          await supabase.from('listing_items').delete().eq('listing_id', listingId)
        }
        if (items.length > 0) {
          const { error: itemError } = await supabase
            .from('listing_items')
            .insert(items.map((item, i) => ({
              listing_id: listingId,
              name: item.name.trim(),
              price: Number(item.price),
              description: item.description.trim() || null,
              duration: listingType === 'service' && item.duration.trim() ? item.duration.trim() : null,
              display_order: i,
            })))
          if (itemError) {
            console.error('Could not save bundle items:', itemError)
            alert('⚠️ Your listing was saved but its bundle items could not be stored: ' + itemError.message)
          }
        }
      }

      alert(isEditMode
        ? '✅ Listing updated!\n\nYour changes are pending review. We\'ll approve it within a few hours.'
        : '🎉 Listing submitted!\n\nWe personally review every listing to ensure quality. You\'ll see it live within a few hours.'
      )
      router.push('/')
      router.refresh()
    } catch (err) {
      alert('Something went wrong. Please try again.')
      console.error(err)
    }

    setLoading(false)
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back
          </Link>
        </div>
      </nav>

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px'}}></div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="fade-up inline-flex items-center gap-2 bg-gold/15 border border-gold/30 text-gold-dark px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5">
            {isEditMode ? 'Edit Listing · Step 1 of 3' : 'New Listing · Step 1 of 3'}
          </div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
            {isEditMode ? (<>Update your<br /><span className="gradient-text">listing</span></>) : (<>Share what<br /><span className="gradient-text">you offer</span></>)}
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70 max-w-xl mx-auto">
            {isEditMode ? 'Make changes and save when ready.' : 'You&apos;ve got the skill. We&apos;ll help students find it.'}
          </p>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-8">
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6">

          <form onSubmit={handleSubmit} className="relative bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-gray-100 space-y-8">

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Listing Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setListingType('product'); setCategory(''); setCategoryError(null) }}
                  className={"relative p-5 rounded-2xl font-semibold border-2 transition-all overflow-hidden group " + (listingType === 'product' ? "border-gold bg-gradient-to-br from-gold/10 to-gold/5 text-charcoal shadow-lg" : "border-gray-200 text-gray-500 hover:border-gray-400")}
                >
                  {listingType === 'product' && (<div className="absolute top-2 right-2 w-2 h-2 bg-gold rounded-full"></div>)}
                  <div className="text-3xl mb-2">📦</div>
                  <div className="font-bold">Product</div>
                  <div className="text-xs mt-1 opacity-60">Physical items to sell</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setListingType('service'); setCategory(''); setCategoryError(null) }}
                  className={"relative p-5 rounded-2xl font-semibold border-2 transition-all overflow-hidden group " + (listingType === 'service' ? "border-gold bg-gradient-to-br from-gold/10 to-gold/5 text-charcoal shadow-lg" : "border-gray-200 text-gray-500 hover:border-gray-400")}
                >
                  {listingType === 'service' && (<div className="absolute top-2 right-2 w-2 h-2 bg-gold rounded-full"></div>)}
                  <div className="text-3xl mb-2">💼</div>
                  <div className="font-bold">Service</div>
                  <div className="text-xs mt-1 opacity-60">Skills or work to offer</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Category *</label>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setCategoryError(null) }}
                required
                className={"w-full px-5 py-4 rounded-2xl border-2 text-charcoal bg-white focus:outline-none transition-colors text-lg " + (categoryError ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-gold")}
              >
                <option value="" disabled>Select a category…</option>
                {getCategoriesByType(listingType).map((c) => (
                  <option key={c.slug} value={c.slug}>{c.emoji} {c.label}</option>
                ))}
              </select>
              {categoryError && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                  <span>⚠️</span>
                  {categoryError}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">📍 Where are you on campus? *</label>
              <select
                value={campusLocation}
                onChange={(e) => { setCampusLocation(e.target.value); setCampusLocationError(null) }}
                required
                className={"w-full px-5 py-4 rounded-2xl border-2 text-charcoal bg-white focus:outline-none transition-colors text-lg " + (campusLocationError ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-gold")}
              >
                <option value="" disabled>Select your location…</option>
                <optgroup label="Halls of Residence">
                  {CAMPUS_LOCATIONS.halls.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </optgroup>
                <optgroup label="Hostels">
                  {CAMPUS_LOCATIONS.hostels.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </optgroup>
                <optgroup label="Off-Campus">
                  {CAMPUS_LOCATIONS.offCampus.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </optgroup>
                <optgroup label="Flexible">
                  {CAMPUS_LOCATIONS.flexible.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </optgroup>
              </select>
              {campusLocationError && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                  <span>⚠️</span>
                  {campusLocationError}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                Photos <span className="text-gray-400 font-normal normal-case">(up to {MAX_PHOTOS}, first = cover)</span>
                {images.length > 0 && (
                  <span className="ml-2 text-xs font-semibold bg-gold/10 text-gold-dark px-2 py-0.5 rounded-full">
                    {images.length}/{MAX_PHOTOS} photos
                  </span>
                )}
              </label>

              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group aspect-square">
                      <img src={img.url} alt={'Photo ' + (idx + 1)} className="w-full h-full object-cover rounded-2xl" />
                      {idx === 0 && (
                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-charcoal/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                          ⭐ Cover
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => moveImage(idx, idx - 1)}
                          disabled={idx === 0}
                          className="w-8 h-8 bg-white text-charcoal rounded-full font-bold hover:bg-gold transition-colors disabled:opacity-30 disabled:hover:bg-white"
                          aria-label="Move photo left"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(idx, idx + 1)}
                          disabled={idx === images.length - 1}
                          className="w-8 h-8 bg-white text-charcoal rounded-full font-bold hover:bg-gold transition-colors disabled:opacity-30 disabled:hover:bg-white"
                          aria-label="Move photo right"
                        >
                          →
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="w-8 h-8 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-colors"
                          aria-label="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {images.length < MAX_PHOTOS ? (
                <label className="relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-gold hover:bg-gold/5 transition-all group">
                  <div className="text-center">
                    <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📸</div>
                    <div className="font-semibold text-charcoal">Click to add photos</div>
                    <div className="text-xs text-gray-500 mt-1">JPG, PNG, WEBP • Max 5MB each • Up to {MAX_PHOTOS} photos</div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImagesChange}
                  />
                </label>
              ) : (
                <p className="text-xs text-gray-500 text-center py-2">Photo limit reached ({MAX_PHOTOS}). Remove one to add another.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Title *</label>
              <input
                type="text"
                placeholder={listingType === 'product' ? "e.g. Calculus Textbook" : "e.g. Hair Braiding"}
                className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-lg"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {derivedPrice === null ? (
              <div>
                <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                  {listingType === 'service' ? 'Price per session *' : 'Price *'}
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">GH₵</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full pl-20 pr-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/20">
                <label className="block text-sm font-bold text-charcoal mb-1 uppercase tracking-widest">Starting Price</label>
                <p className="text-2xl font-bold text-gold-dark">{formatPrice(derivedPrice)}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Auto-calculated from your bundle items below — shoppers will see the range {formatPrice(derivedPrice)}–{formatPrice(Math.max(...items.map((i) => Number(i.price) || 0)))}.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Description</label>
              <textarea
                placeholder="Tell buyers what makes your offering special..."
                className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors resize-none"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {listingType === 'service' && (
              <div className="space-y-8 p-6 bg-gradient-to-br from-gold/5 to-transparent rounded-2xl border border-gold/20">
                <div className="flex items-center gap-2 text-gold-dark">
                  <span className="text-xl">💼</span>
                  <span className="text-sm font-bold uppercase tracking-widest">Service Details</span>
                </div>

                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Duration</label>
                  <input
                    type="text"
                    placeholder="e.g. 1 hour, 30 mins"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-white text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                    value={serviceDuration}
                    onChange={(e) => setServiceDuration(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Legon Campus, I come to you"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-white text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                    value={serviceLocation}
                    onChange={(e) => setServiceLocation(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* BUNDLE ITEMS */}
            <div className="p-6 bg-gradient-to-br from-gold/5 to-transparent rounded-2xl border border-gold/20">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-gold-dark">
                  <span className="text-xl">📦</span>
                  <span className="text-sm font-bold uppercase tracking-widest">Bundle Items</span>
                </div>
                <span className="text-[10px] font-semibold text-gold-dark bg-gold/10 px-2 py-1 rounded-full">OPTIONAL</span>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Add multiple {listingType === 'service' ? 'services' : 'items'} to one listing — like a price menu. Shoppers will see a price range and can book each option.
              </p>

              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setItems([{ name: '', price: '', duration: '', description: '' }])}
                  className="w-full py-3.5 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 font-semibold hover:border-gold hover:text-charcoal hover:bg-gold/5 transition-all"
                >
                  ＋ Add your first item
                </button>
              ) : (
                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-charcoal uppercase tracking-widest">
                          {listingType === 'service' ? 'Service' : 'Item'} {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-xs text-red-500 hover:text-red-600 font-semibold"
                        >
                          ✕ Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          placeholder="Name * (e.g. Box Braids)"
                          className="sm:col-span-2 w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-sm"
                          value={item.name}
                          onChange={(e) => updateItem(idx, { name: e.target.value })}
                        />
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">GH₵</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="Price *"
                            className="w-full pl-14 pr-3 py-3 rounded-xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-sm font-semibold"
                            value={item.price}
                            onChange={(e) => updateItem(idx, { price: e.target.value })}
                          />
                        </div>
                      </div>

                      {listingType === 'service' && (
                        <input
                          type="text"
                          placeholder="Duration (e.g. 3 hours)"
                          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-sm"
                          value={item.duration}
                          onChange={(e) => updateItem(idx, { duration: e.target.value })}
                        />
                      )}

                      <textarea
                        placeholder="Short description (optional)"
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-sm resize-none"
                        value={item.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                      />
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setItems((prev) => [...prev, { name: '', price: '', duration: '', description: '' }])}
                    className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 font-semibold hover:border-gold hover:text-charcoal hover:bg-gold/5 transition-all text-sm"
                  >
                    ＋ Add another {listingType === 'service' ? 'service' : 'item'}
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-charcoal text-white py-4 rounded-2xl font-bold text-lg hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-charcoal/25 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <span>{isEditMode ? 'Saving...' : 'Publishing...'}</span>
              ) : (
                <>
                  <span>{isEditMode ? 'Save Changes' : 'Publish Listing'}</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </>
              )}
            </button>

            <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1.5">
              <span className="text-green-600 font-bold">✓</span>
              Review by the Campus Plug team
            </p>
          </form>

          <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-charcoal to-gray-900 text-white text-center">
            <p className="text-sm text-white/70">
              💡 <strong className="text-gold">Pro tip:</strong> Bundled listings with a price menu get more bookings — add multiple services and great photos.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function NewListingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    }>
      <NewListingContent />
    </Suspense>
  )
}
