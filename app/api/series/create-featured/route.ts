import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title,
      description,
      totalSupply,
      coverImageUrl,
      tags = [],
      cardIds // Array of generated_images or uploaded_images IDs
    } = body

    // Validate required fields
    if (!title || !totalSupply || !cardIds || !Array.isArray(cardIds)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate supply
    if (totalSupply < 1 || totalSupply > 1000) {
      return NextResponse.json(
        { success: false, error: 'Total supply must be between 1 and 1,000' },
        { status: 400 }
      )
    }

    // Validate cards
    if (cardIds.length < 1 || cardIds.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Series must have between 1 and 10 cards' },
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

    // Check if user has enough credits (20 credits for featured series creation)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < 20) {
      return NextResponse.json(
        { success: false, error: 'Insufficient credits. You need 20 credits to create a featured series.' },
        { status: 400 }
      )
    }

    // Verify all cards belong to the user
    const { data: generatedCards } = await supabase
      .from('generated_images')
      .select('id')
      .in('id', cardIds)
      .eq('user_id', user.id)

    const { data: uploadedCards } = await supabase
      .from('uploaded_images')
      .select('id')
      .in('id', cardIds)
      .eq('user_id', user.id)

    const userCardIds = [
      ...(generatedCards || []).map(card => card.id),
      ...(uploadedCards || []).map(card => card.id)
    ]

    if (userCardIds.length !== cardIds.length) {
      return NextResponse.json(
        { success: false, error: 'Some cards do not belong to you or do not exist' },
        { status: 400 }
      )
    }

    // Create series
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .insert({
        creator_id: user.id,
        title,
        description,
        series_type: 'physical_only',
        total_supply: totalSupply,
        remaining_supply: totalSupply,
        price_cents: 900, // Fixed $9.00
        currency: 'USD',
        cover_image_url: coverImageUrl,
        tags,
        featured: true,
        status: 'draft'
      })
      .select()
      .single()

    if (seriesError) {
      console.error('Series creation error:', seriesError)
      return NextResponse.json(
        { success: false, error: 'Failed to create series' },
        { status: 500 }
      )
    }

    // Link cards to series and mark as featured
    const { error: generatedError } = await supabase
      .from('generated_images')
      .update({ 
        series_id: series.id,
        featured: true
      })
      .in('id', cardIds)

    const { error: uploadedError } = await supabase
      .from('uploaded_images')
      .update({ 
        series_id: series.id,
        featured: true
      })
      .in('id', cardIds)

    if (generatedError || uploadedError) {
      console.error('Card linking error:', generatedError || uploadedError)
      // Rollback series creation
      await supabase.from('series').delete().eq('id', series.id)
      return NextResponse.json(
        { success: false, error: 'Failed to link cards to series' },
        { status: 500 }
      )
    }

    // Auto-create marketplace listings for each card
    try {
      const { data: generatedCards } = await supabase
        .from('generated_images')
        .select('id, title')
        .in('id', cardIds)
        .eq('user_id', user.id)

      const { data: uploadedCards } = await supabase
        .from('uploaded_images')
        .select('id, title')
        .in('id', cardIds)
        .eq('user_id', user.id)

      const allCards = [
        ...(generatedCards || []).map(card => ({ ...card, type: 'generated' })),
        ...(uploadedCards || []).map(card => ({ ...card, type: 'uploaded' }))
      ]

      // Create marketplace listings for each card
      for (const card of allCards) {
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

        const { error: listingError } = await supabase
          .from('marketplace_listings')
          .insert({
            seller_id: user.id,
            asset_id: card.id,
            title: card.title || `Featured Card - ${series.title}`,
            description: card.title || `Featured Card - ${series.title}`,
            price_cents: 900, // $9.00 for featured cards
            currency: 'USD',
            status: 'active',
            categories: categories,
            featured: true
          })

        if (listingError) {
          console.warn(`Failed to create listing for card ${card.id}:`, listingError)
        }
      }

      console.log(`✅ Created ${allCards.length} marketplace listings for series ${series.id}`)
    } catch (error) {
      console.warn('⚠️ Auto-listing error (non-fatal):', error)
    }

    // Deduct credits
    const { error: creditError } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - 20 })
      .eq('id', user.id)

    if (creditError) {
      console.error('Credit deduction error:', creditError)
      // Note: We don't rollback here as the series is created
    }

    return NextResponse.json({
      success: true,
      series: {
        id: series.id,
        title: series.title,
        description: series.description,
        totalSupply: series.total_supply,
        remainingSupply: series.remaining_supply,
        priceCents: series.price_cents,
        currency: series.currency,
        status: series.status,
        featured: series.featured,
        createdAt: series.created_at
      }
    })

  } catch (error: any) {
    console.error('Featured series creation error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unknown error occurred' },
      { status: 500 }
    )
  }
}
