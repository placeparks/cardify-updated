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
    const { 
      asset_id,
      series_id,
      title,
      description,
      price_cents = 900 // Default $9.00 for featured cards
    } = body

    // Validate required fields
    if (!asset_id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 })
    }
    if (!series_id) {
      return NextResponse.json({ error: 'Series ID is required' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Check if user owns the asset
    const { data: asset, error: assetError } = await supabase
      .from('user_assets')
      .select('user_id, featured')
      .eq('id', asset_id)
      .single()

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    if (asset.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only list assets you own' }, { status: 403 })
    }

    // Check if series exists and user owns it
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('id, creator_id, status, remaining_supply, series_type')
      .eq('id', series_id)
      .single()

    if (seriesError || !series) {
      return NextResponse.json({ error: 'Series not found' }, { status: 404 })
    }

    if (series.creator_id !== user.id) {
      return NextResponse.json({ error: 'You can only list cards from your own series' }, { status: 403 })
    }

    if (series.status !== 'active') {
      return NextResponse.json({ error: 'Series must be active to create listings' }, { status: 400 })
    }

    if (series.remaining_supply <= 0) {
      return NextResponse.json({ error: 'Series is sold out' }, { status: 400 })
    }

    // Check if listing already exists for this asset
    const { data: existingListing, error: checkError } = await supabase
      .from('marketplace_listings')
      .select('id')
      .eq('asset_id', asset_id)
      .eq('status', 'active')
      .single()

    if (!checkError && existingListing) {
      return NextResponse.json({ error: 'Asset is already listed' }, { status: 400 })
    }

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

    // Create the marketplace listing
    const { data: listing, error: createError } = await supabase
      .from('marketplace_listings')
      .insert({
        seller_id: user.id,
        asset_id,
        title: title.trim(),
        description: description?.trim() || title.trim(),
        price_cents,
        currency: 'USD',
        status: 'active',
        categories: categories,
        featured: true, // Mark as featured
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (createError) {
      console.error('Failed to create auto-listing:', createError)
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      listing
    })

  } catch (error) {
    console.error('Auto-list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
