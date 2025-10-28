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

    const body = await request.json()
    const { id, title, description } = body

    if (!id) {
      return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 })
    }

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Get current listing details
    const { data: listing, error: fetchError } = await admin
      .from('marketplace_listings')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Update the listing
    const updateData: any = {
      title: title.trim(),
      updated_at: new Date().toISOString()
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null
    }

    const { error: updateError } = await admin
      .from('marketplace_listings')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('Error updating marketplace listing:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update listing',
        detail: updateError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: `Listing renamed from "${listing.title}" to "${title.trim()}"`,
      listing: {
        id,
        title: title.trim(),
        description: description?.trim() || null
      }
    })

  } catch (error) {
    console.error('Unexpected error in admin marketplace rename:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      detail: String(error)
    }, { status: 500 })
  }
}
