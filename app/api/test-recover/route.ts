import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Test endpoint to insert sample custom card orders for testing recovery
 * GET /api/test-recover?email=test@example.com
 */
export async function GET(request: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email') || 'test.recover@example.com';

  try {
    // Insert some test orders
    const testOrders = [
      {
        stripe_session_id: `cs_test_${Date.now()}_1`,
        customer_email: email.toLowerCase(),
        custom_image_url: 'https://replicate.delivery/pbxt/A0VOwRkvvHUfQz45h9S0FC6mEVBQcOQeRRYLBdvQ0faNeIeSA/out-0.webp',
        card_finish: 'rainbow',
        quantity: 3,
        order_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
      },
      {
        stripe_session_id: `cs_test_${Date.now()}_2`,
        customer_email: email.toLowerCase(),
        custom_image_url: 'https://replicate.delivery/czjl/Te5dJ7KtasVg8BFtWfgijvdRf0rCfddPsP0L36PbJH6KyFBA/pulid_output.png',
        card_finish: 'matte',
        quantity: 1,
        order_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      },
      {
        stripe_session_id: `cs_test_${Date.now()}_3`,
        customer_email: email.toLowerCase(),
        custom_image_url: 'https://replicate.delivery/pbxt/ZJCPPwvKLqFBRktJOJf76i7n0WJlOWJwfVQhNZQy3fhPcX2JA/out-0.webp',
        card_finish: 'gloss',
        quantity: 5,
        order_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
      },
    ];

    // Insert test orders
    const { data, error } = await supabase
      .from('custom_card_orders')
      .insert(testOrders)
      .select();

    if (error) {
      console.error('Error inserting test orders:', error);
      return NextResponse.json(
        { error: 'Failed to insert test orders', details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Successfully created ${testOrders.length} test orders for ${email}`,
      orders: data,
      testUrl: `/recover`,
    });

  } catch (error) {
    console.error('Test recover error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}