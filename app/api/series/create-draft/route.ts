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
      title,
      description,
      totalSupply,
      coverImageUrl,
      tags = []
    } = body

    // Validate required fields
    if (!title || !totalSupply) {
      return NextResponse.json({ error: 'Title and total supply are required' }, { status: 400 })
    }

    // Validate supply
    if (totalSupply < 1 || totalSupply > 1000) {
      return NextResponse.json({ error: 'Total supply must be between 1 and 1,000' }, { status: 400 })
    }

    // Check if user has enough credits (20 credits for featured series creation)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits < 20) {
      return NextResponse.json({ error: 'Insufficient credits. You need 20 credits to create a featured series.' }, { status: 400 })
    }

    // Create draft series in database
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .insert({
        creator_id: user.id,
        title: title.trim(),
        description: description?.trim() || null,
        series_type: 'physical_only',
        total_supply: totalSupply,
        remaining_supply: totalSupply,
        price_cents: 900, // Fixed $9.00
        currency: 'USD',
        cover_image_url: coverImageUrl?.trim() || null,
        tags,
        featured: true,
        status: 'draft' // Start as draft, will be activated when cards are added
      })
      .select()
      .single()

    if (seriesError) {
      console.error('Series creation error:', seriesError)
      return NextResponse.json({ error: 'Failed to create series' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      series: {
        id: series.id,
        title: series.title,
        description: series.description,
        series_type: series.series_type, // Include series_type
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
    console.error('Draft series creation error:', error)
    return NextResponse.json({ error: error.message || 'An unknown error occurred' }, { status: 500 })
  }
}
