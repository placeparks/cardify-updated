import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Service role client for admin operations
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Test endpoint to verify database operations
export async function GET(req: NextRequest) {
  try {
    console.log('🧪 Testing database operations...')

    // Test 1: Read from profiles table
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, email, credits')
      .limit(5)

    if (profilesError) {
      console.error('❌ Error reading profiles:', profilesError)
      return NextResponse.json({ 
        error: 'Failed to read profiles', 
        details: profilesError.message 
      }, { status: 500 })
    }

    console.log('✅ Profiles read successfully:', profiles)

    // Test 2: Try to update a profile (dry run)
    const testUserId = profiles?.[0]?.id
    if (testUserId) {
      const { data: updateTest, error: updateError } = await admin
        .from('profiles')
        .update({ credits: profiles[0].credits }) // Update with same value
        .eq('id', testUserId)
        .select('id, credits, email')

      if (updateError) {
        console.error('❌ Error updating profile:', updateError)
        return NextResponse.json({ 
          error: 'Failed to update profile', 
          details: updateError.message 
        }, { status: 500 })
      }

      console.log('✅ Profile update test successful:', updateTest)
    }

    // Test 3: Check if credit_transactions table exists
    const { data: transactions, error: transactionsError } = await admin
      .from('credit_transactions')
      .select('*')
      .limit(3)

    if (transactionsError) {
      console.error('❌ Error reading transactions:', transactionsError)
      return NextResponse.json({ 
        error: 'Failed to read transactions', 
        details: transactionsError.message 
      }, { status: 500 })
    }

    console.log('✅ Transactions read successfully:', transactions)

    return NextResponse.json({
      success: true,
      message: 'All database operations successful',
      data: {
        profiles: profiles?.length || 0,
        transactions: transactions?.length || 0,
        sampleProfile: profiles?.[0],
        sampleTransaction: transactions?.[0]
      }
    })

  } catch (error) {
    console.error('💥 Database test error:', error)
    return NextResponse.json({ 
      error: 'Database test failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
