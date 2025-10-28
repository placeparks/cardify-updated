'use client'

import { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Trash2, 
  Eye, 
  Download, 
  Search, 
  Calendar, 
  User, 
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  Loader2
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export const dynamic = "force-dynamic"

type DeletedImage = {
  id: string
  original_asset_id: string
  seller_id: string
  title: string
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  width: number | null
  height: number | null
  deleted_at: string
  deleted_by: string | null
  deletion_reason: string
  has_been_sold: boolean
  last_sale_date: string | null
  total_sales_count: number
  created_at: string
  seller_profile?: {
    display_name: string
    email: string
  }
}

export default function DeletedImagesPage() {
  const supabase = createClientComponentClient()
  const [deletedImages, setDeletedImages] = useState<DeletedImage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterReason, setFilterReason] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"deleted_at" | "title" | "seller">("deleted_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

  // Fetch deleted images
  const fetchDeletedImages = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('deleted_images')
        .select(`
          *,
          seller_profile:profiles!deleted_images_seller_id_fkey(display_name, email)
        `)
        .order('deleted_at', { ascending: false })

      if (error) {
        console.error('Error fetching deleted images:', error)
      } else {
        setDeletedImages(data || [])
      }
    } catch (error) {
      console.error('Error fetching deleted images:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeletedImages()
  }, [])

  // Filter and sort images
  const filteredImages = deletedImages
    .filter(img => {
      const matchesSearch = img.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           img.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           img.seller_profile?.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesReason = filterReason === "all" || img.deletion_reason === filterReason
      
      return matchesSearch && matchesReason
    })
    .sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case "deleted_at":
          comparison = new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime()
          break
        case "title":
          comparison = a.title.localeCompare(b.title)
          break
        case "seller":
          comparison = (a.seller_profile?.display_name || "").localeCompare(b.seller_profile?.display_name || "")
          break
      }
      
      return sortOrder === "asc" ? comparison : -comparison
    })

  // Get image URL for display
  const getImageUrl = (image: DeletedImage) => {
    // For deleted images, we need to construct the URL from the asset_id
    // Use the original filename from the database
    const assetId = image.original_asset_id
    const fileName = image.file_name
    return `https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]}/storage/v1/object/public/deleted-images/${assetId}/${fileName}`
  }

  // Download image
  const downloadImage = async (image: DeletedImage) => {
    try {
      const url = getImageUrl(image)
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = image.file_name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Error downloading image:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cyber-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyber-cyan mx-auto mb-4" />
          <p className="text-gray-400">Loading deleted images...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cyber-black">
      <div className="px-6 py-8 pt-24 relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="outline" className="border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-cyber-cyan mb-2">Deleted Images</h1>
              <p className="text-gray-400">Manage and view deleted images for physical delivery</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-white">{deletedImages.length}</div>
              <div className="text-sm text-gray-400">Total Deleted</div>
            </CardContent>
          </Card>
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-cyber-green">
                {deletedImages.filter(img => img.has_been_sold).length}
              </div>
              <div className="text-sm text-gray-400">Sold Before Deletion</div>
            </CardContent>
          </Card>
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-cyber-pink">
                {deletedImages.filter(img => img.deletion_reason === 'user_deleted').length}
              </div>
              <div className="text-sm text-gray-400">User Deleted</div>
            </CardContent>
          </Card>
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-400">
                {deletedImages.reduce((sum, img) => sum + img.total_sales_count, 0)}
              </div>
              <div className="text-sm text-gray-400">Total Sales</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-cyber-dark/60 border border-cyber-cyan/30 mb-8">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search images..."
                    className="pl-10 bg-cyber-dark/60 border-cyber-cyan/30 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Deletion Reason</label>
                <select
                  value={filterReason}
                  onChange={(e) => setFilterReason(e.target.value)}
                  className="w-full bg-cyber-dark/60 border border-cyber-cyan/30 text-white rounded px-3 py-2"
                >
                  <option value="all">All Reasons</option>
                  <option value="user_deleted">User Deleted</option>
                  <option value="admin_deleted">Admin Deleted</option>
                  <option value="system_deleted">System Deleted</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-cyber-dark/60 border border-cyber-cyan/30 text-white rounded px-3 py-2"
                >
                  <option value="deleted_at">Deletion Date</option>
                  <option value="title">Title</option>
                  <option value="seller">Seller</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Order</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="w-full bg-cyber-dark/60 border border-cyber-cyan/30 text-white rounded px-3 py-2"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Images Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredImages.map((image) => (
            <Card key={image.id} className="bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60 transition-all">
              <CardContent className="p-4">
                {/* Image Preview */}
                <div className="relative aspect-[5/7] bg-gradient-to-br from-cyber-dark/40 to-cyber-dark/80 rounded-lg overflow-hidden mb-4 border-2 border-cyber-cyan/50">
                  <Image
                    src={getImageUrl(image)}
                    alt={image.title}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg'
                    }}
                  />
                  {image.has_been_sold && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-green-500/15 border-0 text-green-400 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Sold
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Image Info */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-white truncate" title={image.title}>
                    {image.title}
                  </h3>
                  
                  <div className="text-xs text-gray-400">
                    <div className="flex items-center gap-1 mb-1">
                      <User className="w-3 h-3" />
                      <span>{image.seller_profile?.display_name || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(image.deleted_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Trash2 className="w-3 h-3" />
                      <span className="capitalize">{image.deletion_reason.replace('_', ' ')}</span>
                    </div>
                  </div>

                  {image.has_been_sold && (
                    <div className="text-xs text-cyber-green">
                      <div>Sales: {image.total_sales_count}</div>
                      {image.last_sale_date && (
                        <div>Last Sale: {new Date(image.last_sale_date).toLocaleDateString()}</div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/10"
                      onClick={() => window.open(getImageUrl(image), '_blank')}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-cyber-green/30 text-cyber-green hover:bg-cyber-green/10"
                      onClick={() => downloadImage(image)}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredImages.length === 0 && (
          <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
            <CardContent className="p-8 text-center">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">No Deleted Images Found</h3>
              <p className="text-gray-400">
                {searchTerm || filterReason !== "all" 
                  ? "Try adjusting your search or filter criteria."
                  : "No images have been deleted yet."
                }
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
