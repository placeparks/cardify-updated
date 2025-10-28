import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { seriesId, quantityAvailable, priceCents, currency = 'USD' } = body

    // Validate required fields
    if (!seriesId || !quantityAvailable || !priceCents) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate quantity
    if (quantityAvailable < 1) {
      return NextResponse.json(
        { success: false, error: 'Quantity must be at least 1' },
        { status: 400 }
      )
    }

    // Validate price
    if (priceCents < 100) { // Minimum $1.00
      return NextResponse.json(
        { success: false, error: 'Price must be at least $1.00' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Get user from auth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication' },
        { status: 401 }
      )
    }

    // Check if series exists and belongs to user
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .eq('creator_id', user.id)
      .single()

    if (seriesError || !series) {
      return NextResponse.json(
        { success: false, error: 'Series not found or access denied' },
        { status: 404 }
      )
    }

    // Check if series can be listed
    if (series.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: 'Series must be in draft status to list' },
        { status: 400 }
      )
    }

    // Check if quantity is available
    if (quantityAvailable > series.remaining_supply) {
      return NextResponse.json(
        { success: false, error: `Only ${series.remaining_supply} cards available` },
        { status: 400 }
      )
    }

    // Check if user already has an active listing for this series
    const { data: existingListing } = await supabase
      .from('series_listings')
      .select('id')
      .eq('series_id', seriesId)
      .eq('seller_id', user.id)
      .eq('status', 'active')
      .single()

    if (existingListing) {
      return NextResponse.json(
        { success: false, error: 'You already have an active listing for this series' },
        { status: 400 }
      )
    }

    // Create listing
    const { data: listing, error: listingError } = await supabase
      .from('series_listings')
      .insert({
        series_id: seriesId,
        seller_id: user.id,
        quantity_available: quantityAvailable,
        price_cents: priceCents,
        currency,
        status: 'active'
      })
      .select()
      .single()

    if (listingError) {
      console.error('Listing creation error:', listingError)
      return NextResponse.json(
        { success: false, error: 'Failed to create listing' },
        { status: 500 }
      )
    }

    // Update series status to active
    const { error: updateError } = await supabase
      .from('series')
      .update({ 
        status: 'active',
        launched_at: new Date().toISOString()
      })
      .eq('id', seriesId)

    if (updateError) {
      console.error('Series update error:', updateError)
      // Note: We don't rollback the listing as it's created
    }

    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id,
        seriesId: listing.series_id,
        quantityAvailable: listing.quantity_available,
        priceCents: listing.price_cents,
        currency: listing.currency,
        status: listing.status,
        createdAt: listing.created_at
      }
    })

  } catch (error: any) {
    console.error('Series listing error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unknown error occurred' },
      { status: 500 }
    )
  }
}
