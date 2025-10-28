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

    // Get view counts for the requested assets
    const { data: viewsData, error } = await admin
      .from('asset_views')
      .select('asset_id')
      .in('asset_id', asset_ids)

    if (error) {
      console.error('Failed to fetch view counts:', error)
      return NextResponse.json({ error: 'Failed to fetch view counts' }, { status: 500 })
    }

    // Count views per asset
    const viewCounts: Record<string, number> = {}
    viewsData?.forEach((view: any) => {
      const assetId = view.asset_id
      if (assetId) {
        viewCounts[assetId] = (viewCounts[assetId] || 0) + 1
      }
    })

    return NextResponse.json({ viewCounts })
  } catch (error) {
    console.error('View counts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
