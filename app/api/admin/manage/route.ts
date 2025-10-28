import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Admin management API called')
    
    // Create Supabase client for auth
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('❌ User not authenticated')
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check if current user is admin using admins table
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()
    
    // Check if there are any admins at all - if not, allow first admin to be added
    const { data: allAdmins } = await supabase
      .from('admins')
      .select('user_id')
      .limit(1)
    
    if (!adminProfile && allAdmins && allAdmins.length > 0) {
      console.log('❌ User not authorized as admin')
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get the request data
    const { email } = await request.json()
    
    if (!email) {
      console.log('❌ Missing email parameter')
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    console.log('📝 Request data:', { email })

    // Get Supabase client with service key for admin operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Check if user exists in profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single()

    if (profileError || !profile) {
      console.log('❌ User profile not found for email:', email)
      return NextResponse.json({ error: 'User not found. Please ensure the user has an account.' }, { status: 404 })
    }

    // Check if user is already an admin
    const { data: existingAdmin } = await supabaseAdmin
      .from('admins')
      .select('user_id')
      .eq('user_id', profile.id)
      .single()

    if (existingAdmin) {
      console.log('❌ User is already an admin')
      return NextResponse.json({ error: 'User is already an admin' }, { status: 400 })
    }

    // Insert new admin record
    const { data: newAdmin, error: insertError } = await supabaseAdmin
      .from('admins')
      .insert({
        user_id: profile.id,
        email: email,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('❌ Error inserting admin:', insertError)
      return NextResponse.json({ error: 'Failed to add admin user' }, { status: 500 })
    }

    // Update the user's profile to set is_admin = true
    // Try using raw SQL to bypass RLS policies
    const { data: profileUpdateData, error: profileUpdateError } = await supabaseAdmin
      .rpc('update_profile_admin_status', {
        profile_id: profile.id,
        is_admin_value: true
      })

    if (profileUpdateError) {
      console.error('❌ Error updating profile is_admin status with RPC:', profileUpdateError)
      
      // Fallback: Try direct update with service role
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from('profiles')
        .update({ is_admin: true, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
        .select('id, is_admin')

      if (fallbackError) {
        console.error('❌ Fallback update also failed:', fallbackError)
        console.error('❌ Profile update error details:', {
          rpcError: profileUpdateError,
          fallbackError: fallbackError,
          profileId: profile.id,
          email: email
        })
        // Return error if both methods fail
        return NextResponse.json({ 
          error: 'Failed to update profile admin status. Admin added to admins table but profile update failed.' 
        }, { status: 500 })
      } else {
        console.log('✅ Profile is_admin status updated successfully via fallback:', fallbackData)
      }
    } else {
      console.log('✅ Profile is_admin status updated successfully via RPC:', profileUpdateData)
    }

    console.log('✅ Admin user added successfully:', newAdmin)
    
    return NextResponse.json({
      success: true,
      message: `${email} has been granted admin access`,
      admin: newAdmin
    })

  } catch (error) {
    console.error('💥 Admin management error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Admin management GET called')
    
    // Create Supabase client for auth
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('❌ User not authenticated')
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check if current user is admin using admins table
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()
    
    // Check if there are any admins at all - if not, allow first admin to access
    const { data: allAdmins } = await supabase
      .from('admins')
      .select('user_id')
      .limit(1)
    
    if (!adminProfile && allAdmins && allAdmins.length > 0) {
      console.log('❌ User not authorized as admin')
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    // Get Supabase client with service key for admin operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Get current admin users from admins table
    const { data: adminUsers, error } = await supabaseAdmin
      .from('admins')
      .select('user_id, email, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.log('❌ Error fetching admin users:', error)
      return NextResponse.json({ error: 'Failed to fetch admin users' }, { status: 500 })
    }

    console.log('✅ Admin users fetched successfully')
    
    return NextResponse.json({
      success: true,
      adminUsers: adminUsers || []
    })

  } catch (error) {
    console.error('💥 Admin management GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    console.log('🔍 Admin management DELETE called')
    
    // Create Supabase client for auth
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('❌ User not authenticated')
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check if current user is admin using admins table
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()
    
    if (!adminProfile) {
      console.log('❌ User not authorized as admin')
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get the request data
    const { email } = await request.json()
    
    if (!email) {
      console.log('❌ Missing email parameter')
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    console.log('📝 Request data:', { email })

    // Get Supabase client with service key for admin operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    // Check if user exists in profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single()

    if (profileError || !profile) {
      console.log('❌ User profile not found for email:', email)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user is an admin
    const { data: existingAdmin } = await supabaseAdmin
      .from('admins')
      .select('user_id')
      .eq('user_id', profile.id)
      .single()

    if (!existingAdmin) {
      console.log('❌ User is not an admin')
      return NextResponse.json({ error: 'User is not an admin' }, { status: 400 })
    }

    // Remove admin record
    const { error: deleteError } = await supabaseAdmin
      .from('admins')
      .delete()
      .eq('user_id', profile.id)

    if (deleteError) {
      console.error('❌ Error removing admin:', deleteError)
      return NextResponse.json({ error: 'Failed to remove admin user' }, { status: 500 })
    }

    // Update the user's profile to set is_admin = false
    // Try using RPC function first
    const { data: profileUpdateData, error: profileUpdateError } = await supabaseAdmin
      .rpc('update_profile_admin_status', {
        profile_id: profile.id,
        is_admin_value: false
      })

    if (profileUpdateError) {
      console.error('❌ Error updating profile is_admin status with RPC:', profileUpdateError)
      
      // Fallback: Try direct update with service role
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from('profiles')
        .update({ is_admin: false, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
        .select('id, is_admin')

      if (fallbackError) {
        console.error('❌ Fallback update also failed:', fallbackError)
        console.error('❌ Profile update error details:', {
          rpcError: profileUpdateError,
          fallbackError: fallbackError,
          profileId: profile.id,
          email: email
        })
        // Note: We don't rollback the admin deletion here as the main operation succeeded
        // The profile update is for consistency but not critical for admin functionality
      } else {
        console.log('✅ Profile is_admin status updated successfully via fallback:', fallbackData)
      }
    } else {
      console.log('✅ Profile is_admin status updated successfully via RPC:', profileUpdateData)
    }

    console.log('✅ Admin user removed successfully')
    
    return NextResponse.json({
      success: true,
      message: `${email} has been removed from admin access`
    })

  } catch (error) {
    console.error('💥 Admin management DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
