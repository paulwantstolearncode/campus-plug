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
