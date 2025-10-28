import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Get featured series with creator info
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select(`
        id,
        title,
        description,
        series_type,
        total_supply,
        remaining_supply,
        price_cents,
        currency,
        cover_image_url,
        tags,
        featured,
        status,
        created_at,
        launched_at,
        creator:profiles!series_creator_id_fkey (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('featured', true)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (seriesError) {
      console.error('Featured series fetch error:', seriesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch featured series' },
        { status: 500 }
      )
    }

    // Get cards for each series
    const seriesWithCards = await Promise.all(
      series.map(async (seriesItem) => {
        // Get generated images for this series
        const { data: generatedCards } = await supabase
          .from('generated_images')
          .select('id, title, image_url, created_at')
          .eq('series_id', seriesItem.id)

        // Get uploaded images for this series
        const { data: uploadedCards } = await supabase
          .from('uploaded_images')
          .select('id, title, image_url, created_at')
          .eq('series_id', seriesItem.id)

        const allCards = [
          ...(generatedCards || []).map(card => ({ ...card, type: 'generated' })),
          ...(uploadedCards || []).map(card => ({ ...card, type: 'uploaded' }))
        ]

        return {
          ...seriesItem,
          cards: allCards,
          soldCount: seriesItem.total_supply - seriesItem.remaining_supply,
          soldPercentage: Math.round(((seriesItem.total_supply - seriesItem.remaining_supply) / seriesItem.total_supply) * 100)
        }
      })
    )

    return NextResponse.json({
      success: true,
      series: seriesWithCards
    })

  } catch (error: any) {
    console.error('Featured series API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unknown error occurred' },
      { status: 500 }
    )
  }
}
