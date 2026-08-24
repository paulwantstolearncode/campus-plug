// Curated list of campus locations / delivery types for listings.
// Sellers pick from these options (grouped <optgroup> in the form) — never
// freeform text, so filtering by location stays clean later.

export const CAMPUS_LOCATIONS = {
  halls: [
    'Akuafo Hall',
    'Commonwealth Hall',
    'Legon Hall',
    'Mensah Sarbah Hall',
    'Volta Hall',
    'Alexander Kwapong Hall',
    'Elizabeth Sey Hall',
    'Hilla Limann Hall',
    'Jean Nelson Aka Hall',
  ],
  hostels: [
    'Pentagon Hostel',
    'Bani Hostel',
    'ISH (International Students Hostel)',
    'Valco Trust Hostel',
    'TF Hostel',
  ],
  offCampus: [
    'Off-campus (East Legon)',
    'Off-campus (Madina)',
    'Off-campus (Adenta)',
    'Off-campus (Other)',
  ],
  flexible: [
    'I come to you',
    'We meet on campus',
    'Delivery available',
  ],
}

// Flat array for easy lookup
export const ALL_LOCATIONS = [
  ...CAMPUS_LOCATIONS.halls,
  ...CAMPUS_LOCATIONS.hostels,
  ...CAMPUS_LOCATIONS.offCampus,
  ...CAMPUS_LOCATIONS.flexible,
]

// Helper to check if location is valid
export function isValidLocation(location: string): boolean {
  return ALL_LOCATIONS.includes(location)
}

// ── Smart auto-suggest ──────────────────────────────────────────────────
// Maps keywords found in listing title/description to campus locations.
const KEYWORD_MAP: { keywords: string[]; location: string }[] = [
  // Halls
  { keywords: ['akuafo', 'kaudu'], location: 'Akuafo Hall' },
  { keywords: ['commonwealth'], location: 'Commonwealth Hall' },
  { keywords: ['legon hall', 'james topp nelson aggrey'], location: 'Legon Hall' },
  { keywords: ['mensah sarbah', 'sarbah'], location: 'Mensah Sarbah Hall' },
  { keywords: ['volta'], location: 'Volta Hall' },
  { keywords: ['kwapong'], location: 'Alexander Kwapong Hall' },
  { keywords: ['elizabeth sey'], location: 'Elizabeth Sey Hall' },
  { keywords: ['limann', 'hilla limann'], location: 'Hilla Limann Hall' },
  { keywords: ['jean nelson', 'aka hall'], location: 'Jean Nelson Aka Hall' },
  // Hostels
  { keywords: ['pentagon'], location: 'Pentagon Hostel' },
  { keywords: ['bani'], location: 'Bani Hostel' },
  { keywords: ['ish', 'international students hostel'], location: 'ISH (International Students Hostel)' },
  { keywords: ['valco'], location: 'Valco Trust Hostel' },
  { keywords: ['tf hostel'], location: 'TF Hostel' },
  // Off-campus
  { keywords: ['east legon'], location: 'Off-campus (East Legon)' },
  { keywords: ['madina'], location: 'Off-campus (Madina)' },
  { keywords: ['adenta'], location: 'Off-campus (Adenta)' },
  // Flexible
  { keywords: ['come to you', 'delivery', 'come to me'], location: 'I come to you' },
  { keywords: ['meet on campus', 'campus meetup'], location: 'We meet on campus' },
  { keywords: ['night market', 'market'], location: 'Off-campus (Madina)' },
]

export function suggestLocation(title: string, description: string | null): string | null {
  const text = `${title} ${description || ''}`.toLowerCase()
  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (text.includes(kw)) return entry.location
    }
  }
  return null
}

// ── DB helpers (client-side, use Supabase anon key via RLS) ──────────────
import { supabase } from '@/lib/supabase'

export interface UnassignedListing {
  id: string
  title: string
  description: string | null
  category: string | null
  listing_type: string
  image_url: string | null
  campus_location: string | null
  seller: { full_name: string | null } | null
}

export async function getUnassignedListings(): Promise<UnassignedListing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, description, category, listing_type, image_url, campus_location, seller:profiles!seller_id (full_name)')
    .or('campus_location.is.null,campus_location.eq.')
    .eq('approval_status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch unassigned listings:', error)
    return []
  }
  return (data as unknown as UnassignedListing[]) || []
}

export async function updateListingLocation(
  id: string,
  campusLocation: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('listings')
    .update({ campus_location: campusLocation })
    .eq('id', id)

  if (error) return { error: error.message }
  return { error: null }
}
