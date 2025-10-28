import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import CardDetailClient from './card-detail-client'

interface Props {
  params: { id: string }
}

// Generate metadata for OpenGraph
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerComponentClient({ cookies })

  const { data } = await supabase
    .from('marketplace_listings')
    .select(`
      id,
      title,
      description,
      price_cents,
      currency,
      seller_id,
      buyer_id,
      status,
      created_at,
      user_assets!inner(
        image_url,
        title
      )
    `)
    .eq('id', params.id)
    .single()

  if (!data) {
    return {
      title: 'Card Not Found',
    }
  }

  const imageUrl = (data as any).user_assets?.image_url || '/placeholder.svg'
  const priceFormatted = `$${(data.price_cents / 100).toFixed(2)}`

  return {
    title: `${data.title} - ${priceFormatted}`,
    description: data.description || `${data.title} available for ${priceFormatted} on Cardify Marketplace`,
    openGraph: {
      title: data.title,
      description: data.description || `Available for ${priceFormatted}`,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 1680,
          alt: data.title,
        }
      ],
      type: 'website',
      siteName: 'Cardify Marketplace',
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.description || `Available for ${priceFormatted}`,
      images: [imageUrl],
    },
  }
}

export default async function CardPage({ params }: Props) {
  const supabase = createServerComponentClient({ cookies })

  // Fetch card data
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select(`
      id,
      title,
      description,
      price_cents,
      currency,
      seller_id,
      buyer_id,
      status,
      created_at,
      user_assets!inner(
        image_url,
        title
      )
    `)
    .eq('id', params.id)
    .single()

  if (error || !data) {
    notFound()
  }

  // Transform data to match ListingRow type
  const listing = {
    id: data.id,
    title: data.title,
    description: data.description,
    image_url: (data as any).user_assets?.image_url || null,
    price_cents: data.price_cents,
    currency: data.currency,
    seller_id: data.seller_id,
    buyer_id: data.buyer_id,
    status: data.status as 'active' | 'sold' | 'inactive',
    is_active: data.status === 'active',
    created_at: data.created_at
  }

  // Fetch seller info
  const { data: sellerData } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', data.seller_id)
    .single()

  return <CardDetailClient listing={listing} seller={sellerData} />
}