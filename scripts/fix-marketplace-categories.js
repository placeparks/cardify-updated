#!/usr/bin/env node

/**
 * Script to fix marketplace listing categories based on series type
 * 
 * This script:
 * 1. Finds all marketplace listings that have incorrect categories
 * 2. Determines the correct categories based on the series type
 * 3. Updates the listings with the correct categories
 */

const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function fixMarketplaceCategories() {
  console.log('🔍 Starting marketplace category fix...')
  
  try {
    // Get all marketplace listings with their series information
    const { data: listings, error: listingsError } = await supabase
      .from('marketplace_listings')
      .select(`
        id,
        asset_id,
        categories,
        user_assets!inner(
          series_id,
          series(
            id,
            series_type
          )
        )
      `)
      .eq('status', 'active')

    if (listingsError) {
      console.error('❌ Error fetching listings:', listingsError)
      return
    }

    console.log(`📊 Found ${listings.length} active marketplace listings`)

    let fixedCount = 0
    let skippedCount = 0

    for (const listing of listings) {
      const series = listing.user_assets?.series
      if (!series) {
        console.log(`⚠️  Skipping listing ${listing.id} - no series found`)
        skippedCount++
        continue
      }

      // Determine correct categories based on series type
      let correctCategories = []
      if (series.series_type === 'cards_with_nfts') {
        correctCategories = ['limited_edition', 'nft_redeemable']
      } else if (series.series_type === 'physical_only') {
        correctCategories = ['limited_edition']
      } else {
        // For nfts_only or other types, default to limited_edition
        correctCategories = ['limited_edition']
      }

      // Check if categories need to be updated
      const currentCategories = listing.categories || []
      const categoriesMatch = JSON.stringify(currentCategories.sort()) === JSON.stringify(correctCategories.sort())

      if (!categoriesMatch) {
        console.log(`🔧 Fixing listing ${listing.id}:`)
        console.log(`   Series: ${series.id} (${series.series_type})`)
        console.log(`   Current: [${currentCategories.join(', ')}]`)
        console.log(`   Correct: [${correctCategories.join(', ')}]`)

        // Update the listing with correct categories
        const { error: updateError } = await supabase
          .from('marketplace_listings')
          .update({ 
            categories: correctCategories,
            updated_at: new Date().toISOString()
          })
          .eq('id', listing.id)

        if (updateError) {
          console.error(`❌ Error updating listing ${listing.id}:`, updateError)
        } else {
          console.log(`✅ Updated listing ${listing.id}`)
          fixedCount++
        }
      } else {
        console.log(`✅ Listing ${listing.id} already has correct categories`)
        skippedCount++
      }
    }

    console.log('\n📈 Summary:')
    console.log(`   Total listings: ${listings.length}`)
    console.log(`   Fixed: ${fixedCount}`)
    console.log(`   Skipped: ${skippedCount}`)
    console.log('🎉 Marketplace category fix completed!')

  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

// Run the script
if (require.main === module) {
  fixMarketplaceCategories()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Script failed:', error)
      process.exit(1)
    })
}

module.exports = { fixMarketplaceCategories }

