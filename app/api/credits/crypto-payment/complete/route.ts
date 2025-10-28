import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { transactionId, txHash } = await req.json()
    
    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get the payment record from crypto_credit_payments table
    const { data: payment, error: paymentError } = await supabase
      .from('crypto_credit_payments')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 })
    }

    if (payment.status === 'confirmed') {
      return NextResponse.json({ 
        success: true,
        credits: payment.credits
      })
    }

    // Update payment status to confirmed
    const { error: updateError } = await supabase
      .from('crypto_credit_payments')
      .update({ 
        status: 'confirmed',
        tx_hash: txHash,
        confirmed_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId)

    if (updateError) {
      console.error('Error updating payment status:', updateError)
      return NextResponse.json({ error: 'Failed to update payment status' }, { status: 500 })
    }

    // COMMENTED OUT: Previous crypto_payments table logic for physical cards
    // Uncomment this section when re-enabling physical card crypto payments
    /*
    // Get the payment record (handle missing table gracefully)
    let payment = null
    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from('crypto_payments')
        .select('*')
        .eq('transaction_id', transactionId)
        .eq('user_id', user.id)
        .single()

      if (paymentError) {
        console.log('crypto_payments table not found, continuing without payment record...')
        // Calculate credits from transaction ID (extract amount from ID)
        const amountMatch = transactionId.match(/crypto_credits_\d+_/)
        if (amountMatch) {
          // For now, use a default amount - in production you'd store this properly
          payment = { amount_cents: 1000, credits: 400 } // Default $10 = 4000 credits
        }
      } else {
        payment = paymentData
      }
    } catch (error) {
      console.log('crypto_payments table not found, continuing without payment record...')
      // Use default values for testing
      payment = { amount_cents: 1000, credits: 400 }
    }

    if (!payment) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 })
    }

    // Update payment status to completed (if table exists)
    try {
      const { error: updateError } = await supabase
        .from('crypto_payments')
        .update({ 
          status: 'completed',
          tx_hash: txHash,
          completed_at: new Date().toISOString()
        })
        .eq('transaction_id', transactionId)

      if (updateError) {
        console.log('Could not update payment status (table may not exist)')
      }
    } catch (error) {
      console.log('Could not update payment status (table may not exist)')
    }
    */

    // Credits will be automatically added by database trigger when status changes to 'confirmed'
    // The trigger handles both adding credits to profiles table and recording in credits_ledger
    
    // COMMENTED OUT: Manual credit addition (now handled by database trigger)
    // Uncomment this section if you want to disable the trigger and handle manually
    /*
    // Add credits to user's account
    const { error: creditsError } = await supabase
      .from('profiles')
      .update({ 
        credits: supabase.raw(`credits + ${payment.credits}`)
      })
      .eq('id', user.id)

    if (creditsError) {
      console.error('Error adding credits:', creditsError)
      return NextResponse.json({ error: 'Failed to add credits' }, { status: 500 })
    }

    // Record the credit transaction in the ledger
    const { error: ledgerError } = await supabase
      .from('credits_ledger')
      .insert({
        user_id: user.id,
        amount: payment.credits,
        reason: 'crypto_credits_purchase',
        reference_id: transactionId,
        metadata: { 
          payment_type: 'crypto_credits',
          tx_hash: txHash,
          amount_cents: payment.amount_cents,
          usdc_amount: payment.usdc_amount
        }
      })

    if (ledgerError) {
      console.error('Error recording credit transaction:', ledgerError)
      // Don't fail the request since credits were already added
    }
    */

    return NextResponse.json({
      success: true,
      message: 'Credits added successfully',
      credits: payment.credits
    })

  } catch (error) {
    console.error('Crypto payment completion error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
