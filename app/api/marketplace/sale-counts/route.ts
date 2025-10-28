import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client to bypass RLS
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { asset_ids } = body

    if (!asset_ids || !Array.isArray(asset_ids)) {
      return NextResponse.json({ error: 'asset_ids array is required' }, { status: 400 })
    }

    console.log('💰 Fetching sale counts for:', asset_ids.length, 'assets')

    // Get sale counts for the requested assets
    const { data: salesData, error } = await admin
      .from('asset_buyers')
      .select('asset_id')
      .in('asset_id', asset_ids)

    if (error) {
      console.error('Failed to fetch sale counts:', error)
      return NextResponse.json({ error: 'Failed to fetch sale counts' }, { status: 500 })
    }

    console.log('💰 Found', salesData?.length, 'sales')

    // Count sales per asset
    const saleCounts: Record<string, number> = {}
    salesData?.forEach((sale: any) => {
      const assetId = sale.asset_id
      if (assetId) {
        saleCounts[assetId] = (saleCounts[assetId] || 0) + 1
      }
    })

    console.log('💰 Sale counts:', saleCounts)

    return NextResponse.json({ saleCounts })
  } catch (error) {
    console.error('Sale counts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
