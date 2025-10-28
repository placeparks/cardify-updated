import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title,
      description,
      seriesType,
      totalSupply,
      priceCents,
      currency = 'USD',
      coverImageUrl,
      tags = [],
      cards
    } = body

    // Validate required fields
    if (!title || !seriesType || !totalSupply || !priceCents || !cards || !Array.isArray(cards)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate series type
    if (!['physical_only', 'cards_with_nfts', 'nfts_only'].includes(seriesType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid series type' },
        { status: 400 }
      )
    }

    // Validate supply
    if (totalSupply < 1 || totalSupply > 10000) {
      return NextResponse.json(
        { success: false, error: 'Total supply must be between 1 and 10,000' },
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

    // Validate cards
    if (cards.length < 1 || cards.length > 50) {
      return NextResponse.json(
        { success: false, error: 'Series must have between 1 and 50 cards' },
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

    // Check if user has enough credits (20 credits for series creation)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < 20) {
      return NextResponse.json(
        { success: false, error: 'Insufficient credits. You need 20 credits to create a series.' },
        { status: 400 }
      )
    }

    // Create series in database
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .insert({
        creator_id: user.id,
        title,
        description,
        series_type: seriesType,
        total_supply: totalSupply,
        remaining_supply: totalSupply,
        price_cents: priceCents,
        currency,
        cover_image_url: coverImageUrl,
        tags,
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

    // Create series cards
    const seriesCards = cards.map((card: any, index: number) => ({
      series_id: series.id,
      card_index: index,
      title: card.title,
      description: card.description,
      image_url: card.imageUrl,
      rarity: card.rarity || 'common'
    }))

    const { error: cardsError } = await supabase
      .from('series_cards')
      .insert(seriesCards)

    if (cardsError) {
      console.error('Series cards creation error:', cardsError)
      // Rollback series creation
      await supabase.from('series').delete().eq('id', series.id)
      return NextResponse.json(
        { success: false, error: 'Failed to create series cards' },
        { status: 500 }
      )
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
        seriesType: series.series_type,
        totalSupply: series.total_supply,
        remainingSupply: series.remaining_supply,
        priceCents: series.price_cents,
        currency: series.currency,
        status: series.status,
        createdAt: series.created_at
      }
    })

  } catch (error: any) {
    console.error('Series creation error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unknown error occurred' },
      { status: 500 }
    )
  }
}
