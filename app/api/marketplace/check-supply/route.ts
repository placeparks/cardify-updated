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
    const { asset_id } = body

    if (!asset_id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 })
    }

    // Check if asset is part of a series
    const { data: generatedCard } = await supabase
      .from('generated_images')
      .select('series_id')
      .eq('id', asset_id)
      .single()

    const { data: uploadedCard } = await supabase
      .from('uploaded_images')
      .select('series_id')
      .eq('id', asset_id)
      .single()

    const seriesId = generatedCard?.series_id || uploadedCard?.series_id

    if (!seriesId) {
      // Not a featured card, allow purchase
      return NextResponse.json({ 
        canPurchase: true,
        message: 'Regular card - no supply limits'
      })
    }

    // Check series supply
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('title, remaining_supply, status, total_supply')
      .eq('id', seriesId)
      .single()

    if (seriesError || !series) {
      return NextResponse.json({ error: 'Series not found' }, { status: 404 })
    }

    const canPurchase = series.remaining_supply > 0 && series.status !== 'sold_out'

    return NextResponse.json({
      canPurchase,
      series: {
        title: series.title,
        remainingSupply: series.remaining_supply,
        totalSupply: series.total_supply,
        status: series.status
      },
      message: canPurchase 
        ? `Available: ${series.remaining_supply} of ${series.total_supply} cards`
        : 'Series is sold out'
    })

  } catch (error: any) {
    console.error('Check supply error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
