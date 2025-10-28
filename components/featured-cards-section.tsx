"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Star, 
  Users, 
  Clock, 
  ShoppingCart,
  Package,
  Zap,
  CreditCard
} from 'lucide-react'
import Link from 'next/link'

interface FeaturedSeries {
  id: string
  title: string
  description: string
  series_type: 'physical_only' | 'cards_with_nfts' | 'nfts_only'
  total_supply: number
  remaining_supply: number
  price_cents: number
  currency: string
  cover_image_url?: string
  tags: string[]
  featured: boolean
  status: string
  created_at: string
  launched_at?: string
  creator: {
    id: string
    display_name: string
    avatar_url?: string
  }
  cards: Array<{
    id: string
    title: string
    image_url: string
    type: 'generated' | 'uploaded'
    created_at: string
  }>
  soldCount: number
  soldPercentage: number
}

export function FeaturedCardsSection() {
  const [featuredSeries, setFeaturedSeries] = useState<FeaturedSeries[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFeaturedSeries()
  }, [])

  const fetchFeaturedSeries = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/series/featured')
      const data = await response.json()
      
      if (data.success) {
        setFeaturedSeries(data.series)
      }
    } catch (error) {
      console.error('Error fetching featured series:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(cents / 100)
  }

  const getSeriesTypeIcon = (type: string) => {
    switch (type) {
      case 'physical_only':
        return <CreditCard className="w-4 h-4" />
      case 'cards_with_nfts':
        return <Package className="w-4 h-4" />
      case 'nfts_only':
        return <Zap className="w-4 h-4" />
      default:
        return <Package className="w-4 h-4" />
    }
  }

  const getSeriesTypeColor = (type: string) => {
    switch (type) {
      case 'physical_only':
        return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'cards_with_nfts':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
      case 'nfts_only':
        return 'bg-pink-500/20 text-pink-400 border-pink-500/50'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    }
  }

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-cyan"></div>
        </div>
      </div>
    )
  }

  if (featuredSeries.length === 0) {
    return null // Don't show section if no featured series
  }

  return (
    <div className="mb-8">
      {/* Featured Cards Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Star className="w-6 h-6 text-yellow-400" />
          <h2 className="text-2xl font-bold text-white">Featured Cards</h2>
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
            Limited Edition
          </Badge>
        </div>
        <Button asChild variant="outline" className="border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10">
          <Link href="/series/marketplace">
            View All
          </Link>
        </Button>
      </div>

      {/* Featured Series Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {featuredSeries.slice(0, 6).map((series) => (
          <Card key={series.id} className="bg-cyber-dark/60 border-cyber-cyan/30 hover:border-cyber-cyan/50 transition-all duration-300 group">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getSeriesTypeIcon(series.series_type)}
                  <Badge className={getSeriesTypeColor(series.series_type)}>
                    {series.series_type.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                  <Star className="w-3 h-3 mr-1" />
                  Featured
                </Badge>
              </div>
              
              <CardTitle className="text-white text-lg group-hover:text-cyber-cyan transition-colors">
                {series.title}
              </CardTitle>
              
              <p className="text-gray-400 text-sm line-clamp-2">
                {series.description}
              </p>
            </CardHeader>

            <CardContent>
              {/* Series Cover Image */}
              {series.cover_image_url && (
                <div className="mb-4">
                  <img
                    src={series.cover_image_url}
                    alt={series.title}
                    className="w-full h-32 object-cover rounded-lg border border-cyber-cyan/30"
                  />
                </div>
              )}

              {/* Creator */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-cyber-cyan/20 rounded-full flex items-center justify-center">
                  <span className="text-cyber-cyan text-xs font-bold">
                    {series.creator.display_name.charAt(0)}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">{series.creator.display_name}</span>
              </div>

              {/* Supply Info */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyber-green" />
                  <span className="text-sm text-gray-300">
                    {series.remaining_supply} / {series.total_supply} left
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-cyber-cyan font-bold text-lg">
                    {formatPrice(series.price_cents, series.currency)}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-cyber-cyan to-cyber-green h-2 rounded-full transition-all duration-300"
                    style={{ width: `${series.soldPercentage}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Sold: {series.soldCount}</span>
                  <span>{series.soldPercentage}% sold</span>
                </div>
              </div>

              {/* Tags */}
              {series.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {series.tags.slice(0, 3).map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs border-cyber-cyan/30 text-cyber-cyan">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Action Button */}
              <Button 
                asChild
                className="w-full h-11 bg-transparent border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan/10 transition-all duration-300 flex items-center justify-center gap-2"
                disabled={series.remaining_supply === 0}
              >
                <Link 
                  href="https://tcg-psi.vercel.app/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center justify-center gap-2"
                >
                  {series.remaining_supply === 0 ? (
                    <>
                      <Clock className="w-5 h-5" />
                      SOLD OUT
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-5 h-5" />
                      VIEW SERIES
                    </>
                  )}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
