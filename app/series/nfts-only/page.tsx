"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Navigation } from '@/components/navigation'
import { Sparkles, Upload, ArrowRight, Zap, Package } from 'lucide-react'
import Link from 'next/link'

export default function NFTsOnlyPage() {
  const [selectedOption, setSelectedOption] = useState<'ai' | 'upload' | null>(null)

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="fixed inset-0 scanlines opacity-20 pointer-events-none" />
      <div className="fixed inset-0 bg-cyber-black pointer-events-none" />
      
      {/* Stylized Crypto Word Animation Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Bubble FOMO */}
        <div className="absolute top-20 left-4 sm:left-10 opacity-0 animate-fade-in-out" style={{animationDelay: '0s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-transparent bg-gradient-to-r from-orange-400 via-yellow-400 to-green-400 bg-clip-text drop-shadow-lg" style={{textShadow: '0 0 10px rgba(255,165,0,0.5)'}}>
            FOMO
          </div>
        </div>
        
        {/* Glitch HODL */}
        <div className="absolute top-40 right-4 sm:right-20 opacity-0 animate-fade-in-out" style={{animationDelay: '2s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-transparent bg-gradient-to-r from-blue-500 to-orange-500 bg-clip-text" style={{filter: 'drop-shadow(2px 0 0 #ff0000) drop-shadow(-2px 0 0 #00ffff)'}}>
            HODL
          </div>
        </div>
        
        {/* Liquid HYPE */}
        <div className="absolute top-60 left-8 sm:left-1/4 opacity-0 animate-fade-in-out" style={{animationDelay: '4s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-transparent bg-gradient-to-r from-green-300 to-white bg-clip-text drop-shadow-lg" style={{filter: 'blur(0.5px)'}}>
            HYPE
          </div>
        </div>
        
        {/* Metallic MOON */}
        <div className="absolute bottom-40 right-8 sm:right-1/3 opacity-0 animate-fade-in-out" style={{animationDelay: '1s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-transparent bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-700 bg-clip-text drop-shadow-lg" style={{textShadow: '0 0 15px rgba(255,215,0,0.8)'}}>
            MOON
          </div>
        </div>
        
        {/* Distressed PUMP */}
        <div className="absolute top-32 bottom-60 left-4 sm:left-20 sm:bottom-60 opacity-0 animate-fade-in-out" style={{animationDelay: '3s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-red-600 drop-shadow-lg" style={{textShadow: '2px 2px 0px #8B0000, -1px -1px 0px #FF0000'}}>
            PUMP
          </div>
        </div>
        
        {/* Neon BULL */}
        <div className="absolute top-1/2 right-4 sm:right-10 opacity-0 animate-fade-in-out" style={{animationDelay: '5s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-cyan-400 drop-shadow-lg" style={{textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff'}}>
            BULL
          </div>
        </div>
        
        {/* Glowing APES */}
        <div className="absolute bottom-1/3 left-8 sm:left-1/3 opacity-0 animate-fade-in-out" style={{animationDelay: '6s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-pink-400 drop-shadow-lg" style={{textShadow: '0 0 10px #ff69b4, 0 0 20px #ff69b4'}}>
            APES
          </div>
        </div>
        
        {/* Diamond Effect */}
        <div className="absolute top-1/3 left-1/2 opacity-0 animate-fade-in-out" style={{animationDelay: '3.5s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-transparent bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 bg-clip-text drop-shadow-lg" style={{textShadow: '0 0 15px rgba(255,215,0,0.6)'}}>
            DIAMOND
          </div>
        </div>
        
        {/* Electric GAS */}
        <div className="absolute bottom-1/2 right-8 sm:right-1/4 opacity-0 animate-fade-in-out" style={{animationDelay: '5.5s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-green-400 drop-shadow-lg" style={{textShadow: '0 0 10px #00ff00, 0 0 20px #00ff00'}}>
            GAS
          </div>
        </div>
        
        {/* Glitch NFT */}
        <div className="absolute top-3/4 right-4 sm:right-16 opacity-0 animate-fade-in-out" style={{animationDelay: '7s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-purple-400 drop-shadow-lg" style={{filter: 'drop-shadow(1px 0 0 #ff0000) drop-shadow(-1px 0 0 #00ffff)'}}>
            NFT
          </div>
        </div>
        
        {/* Explosive BOOM */}
        <div className="absolute bottom-1/4 left-1/2 opacity-0 animate-fade-in-out" style={{animationDelay: '1.5s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-transparent bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text drop-shadow-lg" style={{textShadow: '0 0 20px rgba(255,0,0,0.8)'}}>
            BOOM
          </div>
        </div>
        
        {/* Rare Glow */}
        <div className="absolute top-1/4 right-8 sm:right-1/3 opacity-0 animate-fade-in-out" style={{animationDelay: '8s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-yellow-300 drop-shadow-lg" style={{textShadow: '0 0 15px rgba(255,255,0,0.8)'}}>
            RARE
          </div>
        </div>
        
        {/* WAGMI Glow */}
        <div className="absolute top-1/2 left-8 sm:left-16 opacity-0 animate-fade-in-out" style={{animationDelay: '4.5s', animationDuration: '3s'}}>
          <div className="text-sm sm:text-2xl font-black text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text drop-shadow-lg" style={{textShadow: '0 0 15px rgba(147,51,234,0.6)'}}>
            WAGMI
          </div>
        </div>
      </div>

      <Navigation />

      <div className="px-6 py-8 pt-24 pb-20">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center text-white relative z-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-wider mb-4 drop-shadow-lg">
              NFT Collection
            </h1>
            <p className="text-white text-lg drop-shadow-lg">
              Create an NFT series
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Zap className="w-5 h-5 text-cyber-pink" />
              <span className="text-cyber-pink font-mono text-sm">Digital Series</span>
            </div>
          </div>

          {/* Upload Option Only */}
          <div className="max-w-2xl mx-auto mb-8">
            <Card className="bg-gray-800/80 border-2 border-cyber-cyan hover:border-cyber-cyan transition-all duration-300 shadow-2xl backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3">
                  <Upload className="w-6 h-6 text-cyber-pink" />
                  Upload Your Artwork
                </CardTitle>
                <p className="text-gray-100 text-sm">
                  Upload your own artwork to create your NFT collection
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-100">
                      <span className="w-2 h-2 bg-cyber-pink rounded-full"></span>
                      <span>Upload custom artwork</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-100">
                      <span className="w-2 h-2 bg-cyber-pink rounded-full"></span>
                      <span>ERC1155 smart contract deployment</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-100">
                      <span className="w-2 h-2 bg-cyber-pink rounded-full"></span>
                      <span>Full ownership and control</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-100">
                      <span className="w-2 h-2 bg-cyber-pink rounded-full"></span>
                      <span>Automatic royalty setup</span>
                    </div>
                  </div>
                  
                  <Button 
                    asChild
                    className="w-full cyber-button h-11 sm:h-12 text-xs sm:text-sm font-medium"
                  >
                    <Link href="/series/nft-collection" className="flex items-center justify-center">
                      <span className="hidden sm:inline">Start Creating NFT Collection</span>
                      <span className="sm:hidden">Create Collection</span>
                      <ArrowRight className="w-4 h-4 ml-2 flex-shrink-0" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* NFT Info */}
          <div className="max-w-2xl mx-auto">
            <Card className="bg-gray-800/80 border-2 border-cyber-cyan shadow-2xl backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyber-pink" />
                Digital NFT Series
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <h4 className="text-cyber-cyan font-semibold">Smart Contract</h4>
                    <ul className="space-y-2 text-sm text-gray-100">
                      <li className="flex items-start gap-2">
                        <span className="text-cyber-cyan mt-1">•</span>
                        <span>ERC1155 standard compliance</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-cyber-cyan mt-1">•</span>
                        <span>Deployed on Base blockchain</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-cyber-cyan mt-1">•</span>
                        <span>Gas-efficient batch operations</span>
                      </li>
                    </ul>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="text-cyber-yellow font-semibold">Gas Sponsorship</h4>
                    <ul className="space-y-2 text-sm text-gray-100">
                      <li className="flex items-start gap-2">
                        <span className="text-cyber-yellow mt-1">•</span>
                        <span>Gas fees sponsored by paymaster</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-cyber-yellow mt-1">•</span>
                        <span>Zero-cost transactions for users</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-cyber-yellow mt-1">•</span>
                        <span>Seamless collection creation</span>
                      </li>
                    </ul>
                </div>
                
                  <div className="space-y-3">
                    <h4 className="text-cyber-green font-semibold">Revenue Features</h4>
                    <ul className="space-y-2 text-sm text-gray-100">
                    <li className="flex items-start gap-2">
                      <span className="text-cyber-green mt-1">•</span>
                      <span>Configurable royalty system (default 2.5%)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyber-green mt-1">•</span>
                      <span>Automatic royalty distribution</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyber-green mt-1">•</span>
                      <span>Full ownership and control</span>
                    </li>
                  </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
