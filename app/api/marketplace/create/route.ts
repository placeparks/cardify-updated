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
      title, 
      description, 
      price_cents,
      categories,
      featured = false
    } = body

    // Validate required fields
    if (!asset_id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 })
    }
    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!price_cents || price_cents < 100) { // Minimum $1.00
      return NextResponse.json({ error: 'Price must be at least $1.00' }, { status: 400 })
    }
    if (!Array.isArray(categories)) {
      return NextResponse.json({ error: 'Categories must be an array' }, { status: 400 })
    }

    // Validate that categories only contain allowed values
    const validCategories = [
      'mtg',
      'pokemon',
      'proxy',
      'token',
      'nft_linked',
      'anime',
      'comic',
      'realistic',
      'fantasy',
      'meme_parody',
      'playable',
      'commander_staple',
      'nft_redeemable',
      'limited_edition'
    ]
    
    const invalidCategories = categories.filter(cat => !validCategories.includes(cat))
    if (invalidCategories.length > 0) {
      return NextResponse.json({ 
        error: `Invalid categories: ${invalidCategories.join(', ')}`,
        validCategories 
      }, { status: 400 })
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

    // For featured cards, check if the series is sold out
    if (asset.featured) {
      const { data: seriesData } = await supabase
        .from('generated_images')
        .select('series_id')
        .eq('id', asset_id)
        .single()

      const { data: uploadedSeriesData } = await supabase
        .from('uploaded_images')
        .select('series_id')
        .eq('id', asset_id)
        .single()

      const seriesId = seriesData?.series_id || uploadedSeriesData?.series_id

      if (seriesId) {
        const { data: series } = await supabase
          .from('series')
          .select('remaining_supply, status')
          .eq('id', seriesId)
          .single()

        if (series && (series.remaining_supply <= 0 || series.status === 'sold_out')) {
          return NextResponse.json({ 
            error: 'This featured series is sold out and cannot accept new listings' 
          }, { status: 400 })
        }
      }
    }

    // Create the listing
    const { data: listing, error: createError } = await supabase
      .from('marketplace_listings')
      .insert({
        seller_id: user.id,
        asset_id,
        title: title.trim(),
        description: description?.trim() || null,
        price_cents,
        currency: 'USD',
        status: 'active',
        categories,
        featured: featured,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (createError) {
      console.error('Failed to create listing:', createError)
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      listing
    })

  } catch (error) {
    console.error('Create listing error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
