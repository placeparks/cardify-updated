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

interface CreditUpdateRequest {
  userId: string
  amount: number
  type: 'add' | 'subtract'
  reason: string
}

// GET - Fetch users and recent transactions
export async function GET(req: NextRequest) {
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

    // Get URL parameters
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (action === 'users') {
      // Fetch all users
      const { data: users, error: usersError } = await admin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (usersError) {
        console.error('Error fetching users:', usersError)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
      }

      return NextResponse.json({ users: users || [] })
    }

    if (action === 'transactions') {
      // Fetch recent transactions
      const { data: transactions, error: transactionsError } = await admin
        .from('credit_transactions')
        .select(`
          *,
          profiles!credit_transactions_user_id_fkey(email, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (transactionsError) {
        console.error('Error fetching transactions:', transactionsError)
        return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
      }

      return NextResponse.json({ transactions: transactions || [] })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Admin credits API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Update user credits
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

    const body: CreditUpdateRequest = await req.json()
    const { userId, amount, type, reason } = body

    // Validate input
    if (!userId || !amount || amount <= 0 || !type || !reason) {
      return NextResponse.json({ 
        error: 'Missing required fields: userId, amount, type, reason' 
      }, { status: 400 })
    }

    if (!['add', 'subtract'].includes(type)) {
      return NextResponse.json({ 
        error: 'Invalid type. Must be "add" or "subtract"' 
      }, { status: 400 })
    }

    // Get current user credits
    const { data: userProfile, error: userError } = await admin
      .from('profiles')
      .select('credits, email, display_name')
      .eq('id', userId)
      .single()

    if (userError || !userProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Calculate new credits
    const currentCredits = userProfile.credits || 0
    const creditChange = type === 'add' ? amount : -amount
    const newCredits = Math.max(0, currentCredits + creditChange)

    // Check if subtracting would result in negative credits
    if (type === 'subtract' && newCredits < 0) {
      return NextResponse.json({ 
        error: 'Cannot subtract more credits than user has' 
      }, { status: 400 })
    }

    // Update user credits
    console.log('🔄 Updating user credits:', {
      userId,
      currentCredits,
      newCredits,
      creditChange,
      type,
      amount
    })

    const { data: updateData, error: updateError } = await admin
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId)
      .select('id, credits, email')

    if (updateError) {
      console.error('❌ Error updating user credits:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update credits', 
        details: updateError.message 
      }, { status: 500 })
    }

    console.log('✅ Credits updated successfully:', updateData)

    // Record transaction
    console.log('📝 Recording transaction:', {
      userId,
      amount,
      type,
      reason,
      adminId: user.id
    })

    const { data: transactionData, error: transactionError } = await admin
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount: amount,
        type: type,
        reason: reason,
        admin_id: user.id
      })
      .select('id')

    if (transactionError) {
      console.error('❌ Error recording transaction:', transactionError)
      // Note: We don't rollback the credit update here as the main operation succeeded
      // The transaction record is for audit purposes
    } else {
      console.log('✅ Transaction recorded successfully:', transactionData)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully ${type === 'add' ? 'added' : 'subtracted'} ${amount} credits`,
      user: {
        id: userId,
        email: userProfile.email,
        display_name: userProfile.display_name,
        old_credits: currentCredits,
        new_credits: newCredits
      }
    })

  } catch (error) {
    console.error('Admin credits update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
