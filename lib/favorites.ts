import { supabase } from './supabase'

/**
 * Get all listing_ids that a user has favourited
 * @param userId - The user's ID
 * @returns Array of listing_ids
 */
export async function getFavorites(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to get favorites:', error)
      return []
    }

    return data?.map(f => f.listing_id) || []
  } catch (err) {
    console.error('Failed to get favorites:', err)
    return []
  }
}

/**
 * Add a favorite for a user
 * @param userId - The user's ID
 * @param listingId - The listing to favourite
 * @returns { success: boolean, error?: string }
 */
export async function addFavorite(userId: string, listingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, listing_id: listingId })

    if (error) {
      console.error('Failed to add favorite:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Failed to add favorite:', err)
    return { success: false, error: 'Failed to add favorite' }
  }
}

/**
 * Remove a favorite for a user
 * @param userId - The user's ID
 * @param listingId - The listing to unfavourite
 * @returns { success: boolean, error?: string }
 */
export async function removeFavorite(userId: string, listingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId)

    if (error) {
      console.error('Failed to remove favorite:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Failed to remove favorite:', err)
    return { success: false, error: 'Failed to remove favorite' }
  }
}

/**
 * Check if a user has favourited a specific listing
 * @param userId - The user's ID
 * @param listingId - The listing to check
 * @returns boolean
 */
export async function isFavorited(userId: string, listingId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('listing_id', listingId)
      .limit(1)

    if (error) {
      console.error('Failed to check favorite:', error)
      return false
    }

    return data && data.length > 0
  } catch (err) {
    console.error('Failed to check favorite:', err)
    return false
  }
}