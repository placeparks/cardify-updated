"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Navigation } from '@/components/navigation'
import { UploadArea } from '@/components/upload-area'
import { Badge } from '@/components/ui/badge'
import { 
  Zap, 
  Wallet, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  ArrowDown,
  Image as ImageIcon,
  DollarSign,
  Percent,
  Users,
  Crown
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { formatCreditsWithDollars } from '@/lib/utils'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth'
import { SocialLogin } from '@/components/social-login'

interface NFTCollectionFormData {
  name: string
  symbol: string
  description: string
  maxSupply: number
  mintPrice: number
  royaltyBps: number
}

export default function NFTCollectionPage() {
  const [step, setStep] = useState<'wallet' | 'form' | 'review' | 'deploying' | 'complete'>('wallet')
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState(0)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [pinataUrl, setPinataUrl] = useState<string | null>(null)
  const [formData, setFormData] = useState<NFTCollectionFormData>({
    name: '',
    symbol: '',
    description: '',
    maxSupply: 100,
    mintPrice: 0,
    royaltyBps: 500
  })
  const [collectionAddress, setCollectionAddress] = useState<string | null>(null)
  const [deploymentTxHash, setDeploymentTxHash] = useState<string | null>(null)
  const [transferTxHash, setTransferTxHash] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showSocialLogin, setShowSocialLogin] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const { toast } = useToast()
  
  // Use existing wallet system (same as WalletButton)
  const { address: walletAddress, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { ready, login, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { createWallet } = useCreateWallet({
    onSuccess: (wallet) => {
      toast({
        title: "Wallet Created! 🎉",
        description: "Your embedded wallet is ready for NFT collections",
        variant: "default"
      })
    },
    onError: (error) => {
      toast({
        title: "Wallet Creation Failed",
        description: "Failed to create embedded wallet. Please try again.",
        variant: "destructive"
      })
    }
  })
  
  // Get the embedded wallet address (from Privy)
  const embeddedWalletAddress = wallets
    ?.find((wallet) => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2')
    ?.address
  const finalWalletAddress = embeddedWalletAddress || walletAddress || wallets?.[0]?.address || null

  // Check user authentication and credits
  useEffect(() => {
    const checkUser = async () => {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        setUser(user)
        
        // Fetch user credits
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', user.id)
          .single()
        
        if (profile && typeof profile.credits === 'number') {
          setCredits(profile.credits)
        }
      }
      
    }
    
    checkUser()
  }, [])

  // Handle wallet connection - check both external and embedded wallets
  useEffect(() => {

    
    if ((isConnected && walletAddress) || (authenticated && embeddedWalletAddress)) {
      setStep('form')
    }
  }, [isConnected, walletAddress, authenticated, embeddedWalletAddress, finalWalletAddress])

  useEffect(() => {
    if (!ready) return
    console.log('[NFT Deploy] Wallet state', {
      connectedWalletAddress: walletAddress ?? null,
      privyEmbeddedWallet: embeddedWalletAddress ?? null,
      selectedOwnerAddress: finalWalletAddress ?? null,
      availableWallets: wallets?.map((wallet) => ({
        address: wallet.address,
        walletClientType: wallet.walletClientType,
        connectorType: wallet.connectorType ?? null,
      })) ?? []
    })
  }, [ready, wallets, walletAddress, embeddedWalletAddress, finalWalletAddress])

  // Note: Removed automatic wallet creation trigger - user will click button manually

  // Check if user has enough credits
  const hasEnoughCredits = credits >= 20

  const handleImageUpload = async (file: File) => {
    setLoading(true)
    try {
      // Generate a unique file ID
      const fileId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1]; // Remove data URL prefix
          
          // Split into 2MB chunks (to stay under Vercel's limit)
          const chunkSize = 2 * 1024 * 1024; // 2MB
          const chunks = [];
          for (let i = 0; i < base64Data.length; i += chunkSize) {
            chunks.push(base64Data.slice(i, i + chunkSize));
          }

          // Upload chunks
          for (let i = 0; i < chunks.length; i++) {
            const response = await fetch('/api/upload-chunk', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                chunk: chunks[i],
                chunkIndex: i,
                totalChunks: chunks.length,
                fileId
              })
            });

            if (!response.ok) {
              throw new Error('Chunk upload failed');
            }

            const result = await response.json();
            
            // If this was the last chunk and upload is complete
            if (result.pinataUrl) {
              setUploadedImage(URL.createObjectURL(file))
              setPinataUrl(result.pinataUrl)
              setStep('form')
              setLoading(false)
              return;
            }
          }
        } catch (error) {
          toast({
            title: "Upload Failed",
            description: "Failed to upload image to IPFS",
            variant: "destructive"
          })
          setLoading(false)
        }
      };
      
      reader.onerror = () => {
        toast({
          title: "Upload Failed",
          description: "Failed to read file",
          variant: "destructive"
        })
        setLoading(false)
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload image to IPFS",
        variant: "destructive"
      })
      setLoading(false)
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('review')
  }

  const handleDeploy = async () => {
    if (!finalWalletAddress || !pinataUrl || !user) return
    
    setLoading(true)
    setStep('deploying')
    
    try {
      console.log('[NFT Deploy] Starting deployment with state', {
        finalWalletAddress,
        pinataUrl,
        userId: user.id,
        formData,
      })

      // Get Supabase session for authentication
      const { getSupabaseBrowserClient } = await import('@/lib/supabase-browser')
      const supabase = getSupabaseBrowserClient()
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      
      if (!session) {
        throw new Error('Please log in to deploy NFT collections')
      }
      
      const response = await fetch('/api/deploy-nft-collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: formData.name,
          symbol: formData.symbol,
          description: formData.description,
          baseUri: pinataUrl,
          maxSupply: formData.maxSupply,
          mintPrice: formData.mintPrice,
          royaltyBps: formData.royaltyBps,
          royaltyRecipient: finalWalletAddress,
          ownerAddress: finalWalletAddress
        })
      })
      
      if (!response.ok) {
        console.error('[NFT Deploy] API returned non-OK status', response.status)
        throw new Error('Failed to deploy collection')
      }
      
      const result = await response.json()
      console.log('[NFT Deploy] API response', result)
      setCollectionAddress(result.collectionAddress)
      setDeploymentTxHash(result.transactionHash)
      setTransferTxHash(result.transferTransactionHash)
      setStep('complete')
      
      toast({
        title: "Collection Deployed! 🎉",
        description: `Your NFT collection is live at ${result.collectionAddress} (deployed via relayer)`,
        variant: "default"
      })
    } catch (error) {
      toast({
        title: "Deployment Failed",
        description: "Failed to deploy NFT collection",
        variant: "destructive"
      })
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  // Social login component handles wallet connection automatically

  if (!user) {
    return (
      <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
        <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
        <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />
        <div className="fixed inset-0 bg-cyber-black pointer-events-none" />
        
        <Navigation />
        
        <div className="px-6 py-8 pt-24 pb-20">
          <div className="max-w-2xl mx-auto text-center">
            <Card className="bg-gray-800/80 border-2 border-cyber-cyan shadow-2xl backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-center gap-2">
                  <AlertCircle className="w-5 h-5 text-cyber-pink" />
                  Sign In Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-100 mb-6">
                  You need to sign in to create NFT collection
                </p>
                <Button 
                  onClick={() => window.location.href = '/auth/signin'}
                  className="cyber-button"
                >
                  Sign In
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (!hasEnoughCredits) {
    return (
      <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
        <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
        <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />
        <div className="fixed inset-0 bg-cyber-black pointer-events-none" />
        
        <Navigation />
        
        <div className="px-6 py-8 pt-24 pb-20">
          <div className="max-w-2xl mx-auto text-center">
            <Card className="bg-gray-800/80 border-2 border-cyber-pink shadow-2xl backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-center gap-2">
                  <DollarSign className="w-5 h-5 text-cyber-pink" />
                  Insufficient Credits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-100 mb-4">
                  You need 20 credits to create an NFT collection
                </p>
                <div className="flex items-center justify-center gap-4 mb-6">
                  <Badge className="bg-cyber-pink/20 text-cyber-pink border-cyber-pink/50">
                    Required: {formatCreditsWithDollars(20)}
                  </Badge>
                  <Badge className="bg-gray-600/20 text-gray-100 border-gray-600/50">
                    You have: {formatCreditsWithDollars(credits)}
                  </Badge>
                </div>
                <Button 
                  onClick={() => window.location.href = '/credits'}
                  className="cyber-button"
                >
                  Buy Credits
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />

      <Navigation />

      <div className="px-4 sm:px-6 py-6 sm:py-8 pt-20 sm:pt-24 pb-16 sm:pb-20 min-w-0">
        <div className="max-w-4xl mx-auto min-w-0">
          {/* Header */}
          <div className="mb-6 sm:mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-wider mb-3 sm:mb-4">
              Create NFT Collection
            </h1>
            <p className="text-white text-base sm:text-lg drop-shadow-lg">
              Deploy your own ERC1155 NFT collection with full ownership
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Zap className="w-5 h-5 text-cyber-pink" />
              <span className="text-cyber-pink font-mono text-sm">NFT-Only Collection</span>
            </div>
          </div>

          {/* Step 1: Create Wallet Button */}
          {step === 'wallet' && !finalWalletAddress && (
            <Card className="bg-slate-900/95 border-emerald-500 shadow-2xl shadow-emerald-500/30 ">
              <CardHeader className="relative">
                <div className="absolute inset-0 to-transparent rounded-t-lg"></div>
                <CardTitle className="text-white flex items-center gap-3 relative z-10">
                  <div className="p-2 bg-cyber-cyan/20 rounded-lg border border-cyber-cyan/30">
                    <Wallet className="w-6 h-6 text-cyber-cyan" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-emerald-400">
                      Step 1: Create Your Wallet
                    </div>
                    <div className="text-sm text-gray-100 font-normal">
                      Get a secure wallet for your NFT collection with just one click
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="space-y-6">
                  <div className="p-6 bg-gradient-to-r from-cyber-cyan/10 to-cyber-pink/10 border border-cyber-cyan/30 rounded-xl backdrop-blur-sm">
                    <h4 className="text-cyber-cyan font-bold mb-4 flex items-center gap-2">
                      <Crown className="w-5 h-5" />
                      What you get:
                    </h4>
                    <ul className="space-y-3 text-sm text-gray-100">
                      <li className="flex items-center gap-3 p-2 bg-cyber-dark/30 rounded-lg border border-cyber-green/20">
                        <div className="p-1 bg-cyber-green/20 rounded-full">
                          <CheckCircle className="w-4 h-4 text-cyber-green" />
                        </div>
                        <span className="font-medium">Automatic embedded wallet creation</span>
                      </li>
                      <li className="flex items-center gap-3 p-2 bg-cyber-dark/30 rounded-lg border border-cyber-green/20">
                        <div className="p-1 bg-cyber-green/20 rounded-full">
                          <CheckCircle className="w-4 h-4 text-cyber-green" />
                        </div>
                        <span className="font-medium">Full control over your NFT collection</span>
                      </li>
                      <li className="flex items-center gap-3 p-2 bg-cyber-dark/30 rounded-lg border border-cyber-green/20">
                        <div className="p-1 bg-cyber-green/20 rounded-full">
                          <CheckCircle className="w-4 h-4 text-cyber-green" />
                        </div>
                        <span className="font-medium">No ETH required - we handle gas fees</span>
                      </li>
                    </ul>
                  </div>
                  
                  {authenticated && !embeddedWalletAddress ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl backdrop-blur-sm">
                        <p className="text-yellow-400 text-sm font-medium flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          You're signed in but need a wallet. Click below to create your embedded wallet.
                        </p>
                      </div>
                      <Button 
                        onClick={() => {
                          createWallet()
                        }}
                        disabled={false}
                        className="w-full cyber-button h-14 text-lg font-bold shadow-lg shadow-cyber-cyan/30 hover:shadow-cyber-cyan/50 transition-all duration-300"
                        size="lg"
                      >
                        <Wallet className="w-6 h-6 mr-3" />
                        Create Embedded Wallet
                        <Zap className="w-5 h-5 ml-2" />
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      onClick={() => setShowSocialLogin(true)}
                      className="w-full cyber-button h-14 text-lg font-bold shadow-lg shadow-cyber-cyan/30 hover:shadow-cyber-cyan/50 transition-all duration-300"
                      size="lg"
                    >
                      <Wallet className="w-6 h-6 mr-3" />
                      Create Wallet
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Social Login Modal */}
          {showSocialLogin && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="relative w-full max-w-md">
                {!isAuthenticating && (
                  <Button
                    onClick={() => setShowSocialLogin(false)}
                    variant="ghost"
                    size="sm"
                    className="absolute -top-2 -right-2 z-10 bg-white rounded-full w-8 h-8 p-0 hover:bg-gray-100"
                  >
                    ×
                  </Button>
                )}
                {isAuthenticating ? (
                  <div className="bg-white rounded-lg p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyber-cyan mx-auto mb-4"></div>
                    <p className="text-gray-600">Setting up your wallet...</p>
                  </div>
                ) : (
                  <SocialLogin onSuccess={() => {
                    setIsAuthenticating(true)
                    setTimeout(() => {
                      setShowSocialLogin(false)
                      setIsAuthenticating(false)
                    }, 500)
                  }} />
                )}
              </div>
            </div>
          )}


          {/* Show connected wallet */}
          {finalWalletAddress && (
            <Card className="bg-slate-900/95 border-emerald-500 shadow-2xl shadow-emerald-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/50">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-emerald-400">
                      Wallet Connected
                    </div>
                    <div className="text-sm text-gray-100 font-normal">
                      Your wallet is connected and ready for NFT collection ownership
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-800 rounded-lg border border-slate-600">
                      <span className="text-gray-100 text-xs sm:text-sm font-medium block mb-2">Wallet Address:</span>
                      <div className="text-white font-mono text-xs sm:text-sm break-all bg-slate-900 p-3 rounded border border-slate-700 overflow-x-auto">
                        {finalWalletAddress}
                      </div>
                    </div>
                    {embeddedWalletAddress && (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                          <span className="text-emerald-400 text-sm font-bold">🎉 Embedded Wallet Ready</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <Button 
                  onClick={() => setStep('form')}
                  className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 mt-6"
                >
                  Continue to Upload
                  <ArrowDown className="w-5 h-5 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Upload Image */}
          {step === 'form' && (
            <div className="space-y-8">
              <Card className="bg-slate-900/95 border-cyan-500 shadow-2xl shadow-cyan-500/30">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/50">
                      <ImageIcon className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-cyan-400">
                        Step 2: Upload Collection Image
                      </div>
                      <div className="text-sm text-gray-100 font-normal">
                        Upload the image that will represent your NFT collection
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                    <UploadArea
                      onFileUpload={handleImageUpload}
                      disabled={loading}
                      isUploading={loading}
                      uploadProgress={0}
                      fileName=""
                      fileSize=""
                      uploadedImage={uploadedImage}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Collection Form */}
              {uploadedImage && (
                <Card className="bg-slate-900/95 border-purple-500 shadow-2xl shadow-purple-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-3">
                      <div className="p-2 bg-purple-500/20 rounded-lg border border-purple-500/50">
                        <Crown className="w-6 h-6 text-purple-400" />
                      </div>
                      <div>
                        <div className="text-xl font-bold text-purple-400">
                          Step 3: Collection Details
                        </div>
                        <div className="text-sm text-gray-100 font-normal">
                          Configure your NFT collection parameters
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleFormSubmit} className="space-y-6">
                      <div className="space-y-6 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-white text-sm sm:text-base font-medium flex items-center gap-2">
                            <Crown className="w-4 h-4 text-purple-400" />
                            Collection Name
                          </Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="My Awesome Collection"
                            required
                            className="bg-slate-800 border-slate-600 text-white h-12 sm:h-14 focus:border-purple-500 focus:ring-purple-500/20 transition-all duration-300"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="symbol" className="text-white text-sm sm:text-base font-medium flex items-center gap-2">
                            <Zap className="w-4 h-4 text-cyan-400" />
                            Symbol
                          </Label>
                          <Input
                            id="symbol"
                            value={formData.symbol}
                            onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value }))}
                            placeholder="MAC"
                            required
                            className="bg-slate-800 border-slate-600 text-white h-12 sm:h-14 focus:border-cyan-500 focus:ring-cyan-500/20 transition-all duration-300"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description" className="text-white text-sm sm:text-base font-medium flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-emerald-400" />
                          Description
                        </Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Describe your collection..."
                          rows={4}
                          className="bg-slate-800 border-slate-600 text-white min-h-[100px] focus:border-emerald-500 focus:ring-emerald-500/20 transition-all duration-300"
                        />
                      </div>

                      <div className="space-y-6 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="maxSupply" className="text-white flex items-center gap-2 font-medium">
                            <Users className="w-4 h-4 text-purple-400" />
                            Max Supply
                          </Label>
                          <Input
                            id="maxSupply"
                            type="number"
                            value={formData.maxSupply}
                            onChange={(e) => setFormData(prev => ({ ...prev, maxSupply: parseInt(e.target.value) }))}
                            min="5"
                            max="1000"
                            required
                            className="bg-slate-800 border-slate-600 text-white h-12 focus:border-purple-500 focus:ring-purple-500/20 transition-all duration-300"
                          />
                          <p className="text-xs text-gray-100">Between 5 and 1000</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mintPrice" className="text-white flex items-center gap-2 font-medium">
                            <DollarSign className="w-4 h-4 text-emerald-400" />
                            Mint Price (ETH)
                          </Label>
                          <Input
                            id="mintPrice"
                            type="number"
                            step="0.0001"
                            value={formData.mintPrice}
                            onChange={(e) => setFormData(prev => ({ ...prev, mintPrice: parseFloat(e.target.value) }))}
                            min="0"
                            className="bg-slate-800 border-slate-600 text-white h-12 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all duration-300"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="royaltyBps" className="text-white flex items-center gap-2 font-medium">
                            <Percent className="w-4 h-4 text-cyan-400" />
                            Royalty (%)
                          </Label>
                          <Input
                            id="royaltyBps"
                            type="number"
                            value={formData.royaltyBps / 100}
                            onChange={(e) => setFormData(prev => ({ ...prev, royaltyBps: parseFloat(e.target.value) * 100 }))}
                            min="0"
                            max="10"
                            step="0.01"
                            className="bg-slate-800 border-slate-600 text-white h-12 focus:border-cyan-500 focus:ring-cyan-500/20 transition-all duration-300"
                          />
                        </div>
                      </div>

                      <Button type="submit" className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300">
                        Review Collection
                        <ArrowDown className="w-5 h-5 ml-2" />
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 'review' && (
            <Card className="bg-slate-900/95 border-emerald-500 shadow-2xl shadow-emerald-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/50">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-emerald-400">
                      Review Your Collection
                    </div>
                    <div className="text-sm text-gray-100 font-normal">
                      Please review all details before deploying your NFT collection
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {/* Collection Preview */}
                  <div className="space-y-6 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6">
                    <div className="space-y-4">
                      <h4 className="text-cyan-400 font-bold text-lg flex items-center gap-2">
                        <ImageIcon className="w-5 h-5" />
                        Collection Image
                      </h4>
                      {uploadedImage && (
                        <div className="relative group">
                          <img 
                            src={uploadedImage} 
                            alt="Collection preview" 
                            className="w-full h-48 sm:h-56 object-cover rounded-xl border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20 transition-all duration-300 group-hover:border-cyan-500 group-hover:shadow-cyan-500/40"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-emerald-400 font-bold text-lg flex items-center gap-2">
                        <Crown className="w-5 h-5" />
                        Collection Details
                      </h4>
                      <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-slate-800 rounded-lg border border-purple-500/30 gap-2">
                          <span className="text-gray-100 font-medium">Name:</span>
                          <span className="text-purple-400 font-bold">{formData.name}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-slate-800 rounded-lg border border-cyan-500/30 gap-2">
                          <span className="text-gray-100 font-medium">Symbol:</span>
                          <span className="text-cyan-400 font-bold">{formData.symbol}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-slate-800 rounded-lg border border-purple-500/30 gap-2">
                          <span className="text-gray-100 font-medium">Max Supply:</span>
                          <span className="text-purple-400 font-bold">{formData.maxSupply}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-slate-800 rounded-lg border border-emerald-500/30 gap-2">
                          <span className="text-gray-100 font-medium">Mint Price:</span>
                          <span className="text-emerald-400 font-bold">{formData.mintPrice} ETH</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-slate-800 rounded-lg border border-cyan-500/30 gap-2">
                          <span className="text-gray-100 font-medium">Royalty:</span>
                          <span className="text-cyan-400 font-bold">{formData.royaltyBps / 100}%</span>
                        </div>
                        <div className="p-3 bg-slate-800 rounded-lg border border-emerald-500/30">
                          <span className="text-gray-100 font-medium block mb-2">Owner:</span>
                          <span className="text-white font-mono text-xs sm:text-sm break-all block bg-slate-900 p-3 rounded border border-slate-700">
                            {finalWalletAddress}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cost Summary */}
                  <div className="p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/50 rounded-xl">
                    <h4 className="text-purple-400 font-bold text-lg mb-4 flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Deployment Cost
                    </h4>
                    <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-purple-500/30">
                      <span className="text-gray-100 font-medium">NFT Collection Creation</span>
                      <span className="text-purple-400 font-bold text-xl">{formatCreditsWithDollars(20)}</span>
                    </div>
                    <p className="text-sm text-gray-100 mt-3 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      This includes smart contract deployment, ownership transfer, and IPFS storage
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button 
                      onClick={() => setStep('form')}
                      variant="outline"
                      className="w-full sm:flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      Back to Edit
                    </Button>
                    <Button 
                      onClick={handleDeploy}
                      disabled={loading}
                      className="w-full sm:flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Deploying...
                        </>
                      ) : (
                        <>
                          Deploy Collection
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Deploying */}
          {step === 'deploying' && (
            <Card className="bg-slate-900/95 border-cyan-500 shadow-2xl shadow-cyan-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/50">
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-cyan-400">
                      Deploying Your Collection
                    </div>
                    <div className="text-sm text-gray-100 font-normal">
                      Please wait while we deploy your NFT collection to the blockchain
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                    <div className="p-2 bg-emerald-500/20 rounded-full">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-gray-100 font-medium">Image uploaded to IPFS</span>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
                    <div className="p-2 bg-cyan-500/20 rounded-full">
                      <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                    </div>
                    <span className="text-gray-100 font-medium">Deploying via gas sponsorship...</span>
                  </div>
             
                  <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-600">
                    <div className="w-5 h-5 border-2 border-slate-600 rounded-full"></div>
                    <span className="text-gray-100 font-medium">Saving collection data...</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Complete */}
          {step === 'complete' && collectionAddress && (
            <Card className="bg-slate-900/95 border-emerald-500 shadow-2xl shadow-emerald-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg border border-emerald-500/50 animate-pulse">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-emerald-400">
                      Collection Deployed Successfully!
                    </div>
                    <div className="text-sm text-gray-100 font-normal">
                      Your NFT collection is now live on the blockchain
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="p-6 bg-emerald-500/10 border border-emerald-500/50 rounded-xl">
                    <h4 className="text-emerald-400 font-bold text-lg mb-4 flex items-center gap-2">
                      <Crown className="w-5 h-5" />
                      Your NFT Collection
                    </h4>
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-800 rounded-lg border border-emerald-500/30">
                        <span className="text-gray-100 font-medium block mb-2">Address:</span>
                        <span className="text-white font-mono text-xs sm:text-sm break-all block bg-slate-900 p-2 rounded border border-slate-700">{collectionAddress}</span>
                      </div>
                      <div className="p-3 bg-slate-800 rounded-lg border border-cyan-500/30">
                        <span className="text-gray-100 font-medium block mb-2">Owner:</span>
                        <span className="text-white font-mono text-xs sm:text-sm break-all block bg-slate-900 p-2 rounded border border-slate-700">{finalWalletAddress}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-slate-800 rounded-lg border border-purple-500/30 gap-2">
                        <span className="text-gray-100 font-medium">Name:</span>
                        <span className="text-white font-bold">{formData.name}</span>
                      </div>
                      {deploymentTxHash && (
                        <div className="p-3 bg-slate-800 rounded-lg border border-emerald-500/30">
                          <span className="text-gray-100 font-medium block mb-2">Deployment TX:</span>
                          <span className="text-white font-mono text-xs break-all block bg-slate-900 p-2 rounded border border-slate-700">{deploymentTxHash}</span>
                        </div>
                      )}
                      {transferTxHash && (
                        <div className="p-3 bg-slate-800 rounded-lg border border-emerald-500/30">
                          <span className="text-gray-100 font-medium block mb-2">Transfer TX:</span>
                          <span className="text-white font-mono text-xs break-all block bg-slate-900 p-2 rounded border border-slate-700">{transferTxHash}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button 
                      onClick={() => window.open(`https://sepolia.basescan.org/address/${collectionAddress}`, '_blank')}
                      variant="outline"
                      className="w-full sm:flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      View on Basescan
                    </Button>
                    <Button 
                      onClick={() => window.location.href = '/profile'}
                      className="w-full sm:flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      View in Profile
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
