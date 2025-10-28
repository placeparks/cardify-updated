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
    const { asset_id, viewer_id, session_id } = body

    if (!asset_id) {
      console.error('❌ No asset_id provided')
      return NextResponse.json({ error: 'asset_id is required' }, { status: 400 })
    }

    // Get IP address and user agent
    const ip_address = request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || 
                       'unknown'
    const user_agent = request.headers.get('user-agent') || 'unknown'

    // Insert view record using service role (bypasses RLS)
    const { data, error } = await admin
      .from('asset_views')
      .insert({
        asset_id,
        viewer_id: viewer_id || null,
        session_id: session_id || null,
        ip_address: ip_address.split(',')[0].trim(), // Get first IP if multiple
        user_agent,
        viewed_at: new Date().toISOString()
      })
      .select()

    if (error) {
      console.error('❌ Failed to track view:', error)
      return NextResponse.json({ error: 'Failed to track view', details: error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Track view error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
