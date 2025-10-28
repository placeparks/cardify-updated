"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Navigation } from '@/components/navigation'
import { useToast } from '@/hooks/use-toast'
import { 
  Package, 
  Upload, 
  Zap, 
  ArrowRight, 
  ArrowLeft,
  Users,
  DollarSign,
  Star,
  Loader2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface SeriesFormData {
  title: string
  description: string
  totalSupply: number
  tags: string[]
}

export default function CreateSeriesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState<'details' | 'method'>('details')
  const [seriesData, setSeriesData] = useState<SeriesFormData>({
    title: '',
    description: '',
    totalSupply: 100,
    tags: []
  })
  const [tagInput, setTagInput] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createdSeriesId, setCreatedSeriesId] = useState<string | null>(null)

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!seriesData.title.trim()) return
    
    setIsCreating(true)
    try {
      const response = await fetch('/api/series/create-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(seriesData)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create series')
      }

      setCreatedSeriesId(result.series.id)
      
      // Store series data including type for later use
      if (typeof window !== 'undefined') {
        localStorage.setItem('createdSeriesData', JSON.stringify({
          id: result.series.id,
          series_type: result.series.series_type,
          timestamp: Date.now()
        }))
      }
      
      setStep('method')
      
      toast({
        title: "Series Created",
        description: "Your featured series has been created successfully!",
      })
    } catch (error: any) {
      console.error('Series creation error:', error)
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create series. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleMethodSelect = (method: 'upload' | 'generate') => {
    if (!createdSeriesId) {
      toast({
        title: "Error",
        description: "Series not created yet. Please try again.",
        variant: "destructive",
      })
      return
    }
    
    // Get series data from localStorage
    const storedSeriesData = localStorage.getItem('createdSeriesData')
    const parsedData = storedSeriesData ? JSON.parse(storedSeriesData) : {}
    
    // Save series info to localStorage for auto-linking cards
    const seriesData = {
      seriesId: createdSeriesId,
      series_type: parsedData.series_type || 'physical_only',
      timestamp: Date.now()
    };
    localStorage.setItem('activeSeries', JSON.stringify(seriesData));
    console.log('💾 [Create] Saved to localStorage:', seriesData)
    
    if (method === 'upload') {
      router.push(`/series/upload?series=true&seriesId=${createdSeriesId}`)
    } else {
      router.push(`/series/generate?series=true&seriesId=${createdSeriesId}`)
    }
  }

  const addTag = () => {
    if (tagInput.trim() && !seriesData.tags.includes(tagInput.trim())) {
      setSeriesData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }))
      setTagInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setSeriesData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }))
  }

  if (step === 'details') {
    return (
      <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
        <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
        <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />
        <div className="fixed inset-0 bg-gradient-to-br from-cyber-pink/20 via-cyber-cyan/10 to-cyber-green/20 pointer-events-none" />

        <Navigation />

        <div className="px-6 py-8 pt-24 pb-20">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="mb-8 text-center">
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-wider mb-4">
                Create Series
              </h1>
              <p className="text-gray-400 text-lg">
                Set up your limited edition card series details
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Star className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-400 font-mono text-sm">Limited Edition</span>
              </div>
            </div>

            {/* Series Details Form */}
            <Card className="bg-cyber-dark/60 border-cyber-cyan/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-cyber-cyan" />
                  Series Information
                </CardTitle>
                <p className="text-gray-400 text-sm">
                  Tell us about your featured card series
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDetailsSubmit} className="space-y-6">
                  {/* Series Title */}
                  <div>
                    <Label htmlFor="title" className="text-white">Series Title *</Label>
                    <Input
                      id="title"
                      value={seriesData.title}
                      onChange={(e) => setSeriesData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., Cyberpunk Warriors"
                      required
                      className="bg-cyber-dark/50 border-cyber-cyan/30 text-white mt-2"
                    />
                  </div>

                  {/* Series Description */}
                  <div>
                    <Label htmlFor="description" className="text-white">Description</Label>
                    <Textarea
                      id="description"
                      value={seriesData.description}
                      onChange={(e) => setSeriesData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe your series..."
                      rows={3}
                      className="bg-cyber-dark/50 border-cyber-cyan/30 text-white mt-2"
                    />
                  </div>

                  {/* Total Supply */}
                  <div>
                    <Label htmlFor="totalSupply" className="text-white flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Total Supply *
                    </Label>
                    <Input
                      id="totalSupply"
                      type="number"
                      value={seriesData.totalSupply}
                      onChange={(e) => setSeriesData(prev => ({ ...prev, totalSupply: parseInt(e.target.value) || 100 }))}
                      min="1"
                      max="1000"
                      required
                      className="bg-cyber-dark/50 border-cyber-cyan/30 text-white mt-2"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      How many cards will be available in this series (1-1000)
                    </p>
                  </div>


                  {/* Tags */}
                  <div>
                    <Label className="text-white">Tags</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="Add a tag..."
                        className="bg-cyber-dark/50 border-cyber-cyan/30 text-white"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      />
                      <Button
                        type="button"
                        onClick={addTag}
                        variant="outline"
                        className="border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10"
                      >
                        Add
                      </Button>
                    </div>
                    {seriesData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {seriesData.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-cyber-cyan/20 text-cyber-cyan text-xs rounded border border-cyber-cyan/50"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="hover:text-red-400"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Price Display */}
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 font-semibold">Fixed Price</span>
                    </div>
                    <p className="text-white text-lg font-bold">$9.00 per card</p>
                    <p className="text-xs text-gray-400 mt-1">
                      All featured series cards are priced at $9.00
                    </p>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full cyber-button"
                    disabled={!seriesData.title.trim() || isCreating}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Series...
                      </>
                    ) : (
                      <>
                        Continue to Card Creation
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'method') {
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
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-wider mb-4">
                Choose Creation Method
              </h1>
              <p className="text-gray-400 text-lg">
                How would you like to create your series cards?
              </p>
            </div>

            {/* Series Summary */}
            <Card className="bg-cyber-dark/60 border-cyber-cyan/30 mb-8">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-cyber-cyan" />
                  Series Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-400">Title:</span>
                    <span className="text-white ml-2">{seriesData.title}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Supply:</span>
                    <span className="text-white ml-2">{seriesData.totalSupply} cards</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Price:</span>
                    <span className="text-white ml-2">$9.00 per card</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Tags:</span>
                    <span className="text-white ml-2">{seriesData.tags.length > 0 ? seriesData.tags.join(', ') : 'None'}</span>
                  </div>
                </div>
                <Button
                  onClick={() => setStep('details')}
                  variant="outline"
                  className="mt-4 border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Edit Details
                </Button>
              </CardContent>
            </Card>

            {/* Method Selection */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Upload Method */}
              <Card className="bg-cyber-dark/60 border-cyber-green/30 hover:border-cyber-green/50 transition-all duration-300 cursor-pointer group">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-3">
                    <Upload className="w-6 h-6 text-cyber-green" />
                    Upload Images
                  </CardTitle>
                  <p className="text-gray-400 text-sm">
                    Upload your own card images
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-2 h-2 bg-cyber-green rounded-full"></span>
                      <span>Upload existing artwork</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-2 h-2 bg-cyber-green rounded-full"></span>
                      <span>Full control over design</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-2 h-2 bg-cyber-green rounded-full"></span>
                      <span>Perfect for custom artwork</span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => handleMethodSelect('upload')}
                    className="w-full cyber-button"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Images
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>

              {/* Generate Method */}
              <Card className="bg-cyber-dark/60 border-cyber-pink/30 hover:border-cyber-pink/50 transition-all duration-300 cursor-pointer group">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-3">
                    <Zap className="w-6 h-6 text-cyber-pink" />
                    AI Generate
                  </CardTitle>
                  <p className="text-gray-400 text-sm">
                    Use AI to generate card artwork
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-2 h-2 bg-cyber-pink rounded-full"></span>
                      <span>AI-powered generation</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-2 h-2 bg-cyber-pink rounded-full"></span>
                      <span>Multiple art styles</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-2 h-2 bg-cyber-pink rounded-full"></span>
                      <span>Perfect for inspiration</span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => handleMethodSelect('generate')}
                    className="w-full cyber-button"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Generate with AI
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
