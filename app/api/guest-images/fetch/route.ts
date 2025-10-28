// app/api/guest-images/fetch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ===== Supabase (service-role; RLS bypass) ======================================================
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ===== Types ====================================================================================
interface FetchGuestImagesRequest {
  deviceId: string
  sessionId?: string
  limit?: number
  offset?: number
}

// ===== Route ====================================================================================
export async function GET() {
  return NextResponse.json({ 
    error: 'Method not allowed',
    message: 'This endpoint only accepts POST requests for fetching guest images'
  }, { status: 405 })
}

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Guest images fetch API called')
    
    const {
      deviceId,
      sessionId,
      limit = 50,
      offset = 0
    }: FetchGuestImagesRequest = await req.json()
    
    console.log('📦 Request data:', { deviceId, sessionId, limit, offset })

    if (!deviceId) {
      return NextResponse.json({ 
        error: 'Missing required field: deviceId is required' 
      }, { status: 400 })
    }

    // ===== Build query ==========================================================================
    let query = admin
      .from('guest_generated_images')
      .select('*')
      .eq('device_id', deviceId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Add session filter if provided
    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    // ===== Execute query =======================================================================
    console.log('🔍 Fetching guest images...')
    const { data: images, error: fetchError } = await query

    if (fetchError) {
      console.error('Database fetch error:', fetchError)
      return NextResponse.json({ 
        error: 'Failed to fetch images',
        details: fetchError.message 
      }, { status: 500 })
    }

    console.log(`✅ Found ${images?.length || 0} guest images`)

    // ===== Response =============================================================================
    return NextResponse.json({
      success: true,
      images: images || [],
      count: images?.length || 0,
      hasMore: (images?.length || 0) === limit
    })

  } catch (error) {
    console.error('Guest images fetch error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch images',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
