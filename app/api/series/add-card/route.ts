import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { seriesId, assetId, assetType } = body

    // Validate required fields
    if (!seriesId || !assetId || !assetType) {
      return NextResponse.json({ error: 'Series ID, asset ID, and asset type are required' }, { status: 400 })
    }

    // Validate asset type
    if (!['generated', 'uploaded'].includes(assetType)) {
      return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
    }

    // Check if series exists and user owns it
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('id, creator_id, status, remaining_supply, title, series_type')
      .eq('id', seriesId)
      .single()

    if (seriesError || !series) {
      return NextResponse.json({ error: 'Series not found' }, { status: 404 })
    }

    if (series.creator_id !== user.id) {
      return NextResponse.json({ error: 'You can only add cards to your own series' }, { status: 403 })
    }

    if (series.status === 'sold_out') {
      return NextResponse.json({ error: 'Cannot add cards to a sold-out series' }, { status: 400 })
    }

    // Check if asset exists and user owns it
    const assetTable = assetType === 'generated' ? 'generated_images' : 'uploaded_images'
    const { data: asset, error: assetError } = await supabase
      .from(assetTable)
      .select('id, user_id, series_id')
      .eq('id', assetId)
      .single()

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    if (asset.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only add assets you own' }, { status: 403 })
    }

    // Check if asset is already in a series
    if (asset.series_id && asset.series_id !== seriesId) {
      return NextResponse.json({ error: 'Asset is already part of another series' }, { status: 400 })
    }

    // Add asset to series
    const { error: updateError } = await supabase
      .from(assetTable)
      .update({
        series_id: seriesId,
        featured: true
      })
      .eq('id', assetId)

    if (updateError) {
      console.error('Asset update error:', updateError)
      return NextResponse.json({ error: 'Failed to add asset to series' }, { status: 500 })
    }

    // Update series status to active if it was draft
    if (series.status === 'draft') {
      const { error: statusError } = await supabase
        .from('series')
        .update({ status: 'active' })
        .eq('id', seriesId)

      if (statusError) {
        console.warn('Failed to update series status:', statusError)
      }
    }

    // Auto-create marketplace listing for the card
    try {
      console.log(`Creating marketplace listing for asset ${assetId} in series ${seriesId}`)
      
      const { data: assetDetails } = await supabase
        .from(assetTable)
        .select('title')
        .eq('id', assetId)
        .single()

      console.log('Asset details:', assetDetails)

      // Determine categories based on series type
      let categories: string[] = []
      if (series.series_type === 'cards_with_nfts' || series.series_type === 'nft_backed') {
        categories = ['limited_edition', 'nft_redeemable']
      } else if (series.series_type === 'physical_only') {
        categories = ['limited_edition']
      } else {
        // For nfts_only or other types, default to limited_edition
        categories = ['limited_edition']
      }

      const listingData = {
        seller_id: user.id,
        asset_id: assetId,
        title: assetDetails?.title || `Featured Card - ${series.title}`,
        description: assetDetails?.title || `Featured Card - ${series.title}`,
        price_cents: 900, // $9.00 for featured cards
        currency: 'USD',
        status: 'active',
        categories: categories,
        featured: true
      }

      console.log('Listing data:', listingData)

      const { error: listingError } = await supabase
        .from('marketplace_listings')
        .insert(listingData)

      if (listingError) {
        console.error('Failed to create marketplace listing:', listingError)
      } else {
        console.log('Successfully created marketplace listing')
      }
    } catch (error) {
      console.error('Auto-listing error (non-fatal):', error)
    }

    return NextResponse.json({
      success: true,
      message: 'Card added to series successfully'
    })

  } catch (error: any) {
    console.error('Add card to series error:', error)
    return NextResponse.json({ error: error.message || 'An unknown error occurred' }, { status: 500 })
  }
}
