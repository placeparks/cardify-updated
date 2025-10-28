// Frontend API client for ERC1155 collection generation

interface GenerateCollectionRequest {
  collectionNumber: number
  name: string
  symbol: string
  image: string // Base64 encoded image
  description?: string
  maxSupply: number
  royaltyRecipient?: string
  royaltyBps?: number
}

interface GenerateCollectionResponse {
  success: boolean
  collectionAddress?: string
  codes?: string[]
  transactionHash?: string
  error?: string
}

interface CollectionCode {
  id: number
  collection_address: string
  code: string
  hash: string
  used: boolean
  used_by?: string
  used_at?: string
  created_at: string
  updated_at: string
}

export class CollectionAPI {
  private baseUrl: string

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl
  }

  /**
   * Generate a new ERC1155 collection with codes
   */
  async generateCollection(data: GenerateCollectionRequest): Promise<GenerateCollectionResponse> {
    try {
      // Get the current session token from browser
      const { getSupabaseBrowserClient } = await import('@/lib/supabase-browser')
      const supabase = getSupabaseBrowserClient()
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Authentication required')
      }

      const response = await fetch(`${this.baseUrl}/generate-collection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate collection')
      }

      return result
    } catch (error) {
      console.error('Error generating collection:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get codes for a specific collection
   */
  async getCollectionCodes(
    collectionAddress: string,
    used?: boolean
  ): Promise<CollectionCode[]> {
    try {
      const params = new URLSearchParams()
      if (used !== undefined) {
        params.append('used', used.toString())
      }

      const response = await fetch(
        `${this.baseUrl}/collections/${collectionAddress}/codes?${params}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch codes')
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching codes:', error)
      return []
    }
  }

  /**
   * Mark a code as used
   */
  async useCode(collectionAddress: string, code: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/collections/${collectionAddress}/codes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        }
      )

      const result = await response.json()
      return response.ok && result.success
    } catch (error) {
      console.error('Error using code:', error)
      return false
    }
  }

  /**
   * Get all collections for a user
   */
  async getUserCollections(owner: string) {
    try {
      const response = await fetch(`${this.baseUrl}/collections?owner=${owner}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch collections')
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching collections:', error)
      return []
    }
  }

  /**
   * Convert file to base64 for image upload
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
}

// Export a default instance
export const collectionAPI = new CollectionAPI()
