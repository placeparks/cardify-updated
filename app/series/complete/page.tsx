"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Navigation } from '@/components/navigation'
import { 
  Package, 
  CheckCircle, 
  Star, 
  Users, 
  DollarSign,
  ArrowRight,
  Eye,
  ShoppingCart
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface SeriesData {
  title: string
  description: string
  totalSupply: number
  coverImageUrl: string
  tags: string[]
}

export default function CompleteSeriesPage() {
  const router = useRouter()
  const [seriesData, setSeriesData] = useState<SeriesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    // Get series data from session storage
    const stored = sessionStorage.getItem('seriesData')
    if (stored) {
      setSeriesData(JSON.parse(stored))
    }
    setLoading(false)
  }, [])

  const handleCreateSeries = async () => {
    if (!seriesData) return

    setCreating(true)
    try {
      // Get user's recent cards (this would need to be implemented)
      // For now, we'll just show success
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate API call
      
      // Clear session storage
      sessionStorage.removeItem('seriesData')
      
      // Redirect to marketplace
      router.push('/marketplace')
    } catch (error) {
      console.error('Error creating series:', error)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
        <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
        <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-cyan mx-auto mb-4"></div>
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!seriesData) {
    return (
      <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
        <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
        <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />
        <Navigation />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">No Series Data Found</h1>
            <p className="text-gray-400 mb-6">Please start the series creation process again.</p>
            <Button asChild className="cyber-button">
              <Link href="/series/create">Create New Series</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-br from-cyber-pink/20 via-cyber-cyan/10 to-cyber-green/20 pointer-events-none" />

      <Navigation />

      <div className="px-6 py-8 pt-24 pb-20">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-wider">
                Cards Created Successfully!
              </h1>
            </div>
            <p className="text-gray-400 text-lg">
              Your cards are ready. Now let's create your featured series.
            </p>
          </div>

          {/* Series Summary */}
          <Card className="bg-cyber-dark/60 border-cyber-cyan/30 mb-8">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyber-cyan" />
                Series Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <span className="text-gray-400">Title:</span>
                    <p className="text-white font-semibold">{seriesData.title}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Description:</span>
                    <p className="text-white">{seriesData.description || 'No description'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Tags:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {seriesData.tags.length > 0 ? (
                        seriesData.tags.map((tag, index) => (
                          <Badge key={index} className="bg-cyber-cyan/20 text-cyber-cyan border-cyber-cyan/50">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-500">No tags</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyber-green" />
                    <span className="text-gray-400">Total Supply:</span>
                    <span className="text-white font-semibold">{seriesData.totalSupply} cards</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    <span className="text-gray-400">Price:</span>
                    <span className="text-white font-semibold">$9.00 per card</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <span className="text-gray-400">Type:</span>
                    <span className="text-white font-semibold">Featured Series</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Next Steps */}
          <Card className="bg-cyber-dark/60 border-cyber-green/30 mb-8">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                Next Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-400 text-sm font-bold">1</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Select Your Cards</p>
                    <p className="text-gray-400 text-sm">Choose which of your created cards to include in this series</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-cyber-cyan/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-cyber-cyan text-sm font-bold">2</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Create Featured Series</p>
                    <p className="text-gray-400 text-sm">Your series will appear in the marketplace with a "Featured" badge</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-cyber-pink/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-cyber-pink text-sm font-bold">3</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Launch & Promote</p>
                    <p className="text-gray-400 text-sm">Your series will be live and ready for customers to purchase</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={handleCreateSeries}
              disabled={creating}
              className="flex-1 cyber-button"
            >
              {creating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating Series...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4 mr-2" />
                  Create Featured Series
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
            
            <Button
              asChild
              variant="outline"
              className="border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10"
            >
              <Link href="/marketplace">
                <Eye className="w-4 h-4 mr-2" />
                View Marketplace
              </Link>
            </Button>
          </div>

          {/* Info Box */}
          <Card className="mt-8 bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Star className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-yellow-400 font-semibold mb-2">Featured Series Benefits</h4>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Prominent placement in the marketplace</li>
                    <li>• "Featured" badge for increased visibility</li>
                    <li>• Limited edition status with supply tracking</li>
                    <li>• Fixed $9.00 pricing for all cards</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
