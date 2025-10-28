import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Service role client for admin operations
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function PUT(request: NextRequest) {
  try {
    // Create Supabase client for auth
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check if user is admin using admins table
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (!adminProfile) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const listingId = searchParams.get('id')

    if (!listingId) {
      return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 })
    }

    // Get listing details before unlisting
    const { data: listing, error: fetchError } = await admin
      .from('marketplace_listings')
      .select('*')
      .eq('id', listingId)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Check if listing has been sold
    if (listing.status === 'sold') {
      return NextResponse.json({ 
        error: 'Cannot unlist sold listings. Use deactivate instead.' 
      }, { status: 400 })
    }

    // Make the listing inactive (unlist it)
    const { error: updateError } = await admin
      .from('marketplace_listings')
      .update({ 
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', listingId)

    if (updateError) {
      console.error('Error unlisting marketplace listing:', updateError)
      return NextResponse.json({ 
        error: 'Failed to unlist listing',
        detail: updateError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: `Listing "${listing.title}" unlisted successfully`
    })

  } catch (error) {
    console.error('Unexpected error in admin marketplace unlist:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      detail: String(error)
    }, { status: 500 })
  }
}
