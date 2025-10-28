import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// Service role client for admin operations
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Manual fix endpoint to update credits based on transactions
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check admin status
    const { data: adminProfile, error: adminError } = await admin
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminError || !adminProfile) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    console.log('🔧 Fixing credits for user:', userId)

    // Get all transactions for this user
    const { data: transactions, error: transactionsError } = await admin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (transactionsError) {
      console.error('❌ Error fetching transactions:', transactionsError)
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    console.log('📊 Found transactions:', transactions)

    // Calculate total credits from transactions
    let totalCredits = 0
    transactions?.forEach(transaction => {
      if (transaction.type === 'add') {
        totalCredits += transaction.amount
      } else if (transaction.type === 'subtract') {
        totalCredits -= transaction.amount
      }
    })

    console.log('🧮 Calculated total credits:', totalCredits)

    // Get current user profile
    const { data: userProfile, error: userError } = await admin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log('👤 Current user profile:', {
      id: userProfile.id,
      email: userProfile.email,
      currentCredits: userProfile.credits,
      calculatedCredits: totalCredits
    })

    // Update user credits
    const { data: updateData, error: updateError } = await admin
      .from('profiles')
      .update({ credits: totalCredits })
      .eq('id', userId)
      .select('id, credits, email')

    if (updateError) {
      console.error('❌ Error updating credits:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update credits', 
        details: updateError.message 
      }, { status: 500 })
    }

    console.log('✅ Credits fixed successfully:', updateData)

    return NextResponse.json({
      success: true,
      message: 'Credits fixed successfully',
      data: {
        userId,
        oldCredits: userProfile.credits,
        newCredits: totalCredits,
        transactionsCount: transactions?.length || 0,
        transactions: transactions
      }
    })

  } catch (error) {
    console.error('💥 Fix credits error:', error)
    return NextResponse.json({ 
      error: 'Fix credits failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
