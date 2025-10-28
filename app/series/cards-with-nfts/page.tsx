"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Navigation } from '@/components/navigation'
import { Sparkles, Upload, ArrowRight, Layers, Package } from 'lucide-react'
import Link from 'next/link'

export default function CardsWithNFTsPage() {
  const [selectedOption, setSelectedOption] = useState<'ai' | 'upload' | null>(null)

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
              Cards + Redeemable NFTs
            </h1>
            <p className="text-gray-400 text-lg">
              Create a series with both physical cards and digital NFTs
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Package className="w-5 h-5 text-cyber-cyan" />
              <span className="text-cyber-cyan font-mono text-sm">Series Creation</span>
            </div>
          </div>

          {/* Choose Creation Method */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* AI Generation Option */}
            <Card 
              className={`transition-all duration-300 cursor-pointer ${
                selectedOption === 'ai' 
                  ? 'bg-slate-900/95 border-cyan-500 shadow-2xl shadow-cyan-500/30' 
                  : 'bg-slate-900/95 border-cyan-500/50 hover:border-cyan-500'
              }`}
              onClick={() => setSelectedOption('ai')}
            >
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                  AI Generate
                </CardTitle>
                <p className="text-gray-300 text-sm">
                  Use AI to create unique card designs for your series
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                    <span>AI-powered card generation</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                    <span>Automatic NFT collection creation</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                    <span>Redemption codes for each NFT</span>
                  </div>
                </div>
                
                {selectedOption === 'ai' && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <Button 
                      asChild
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      <Link href="/series/generate">
                        Start AI Generation
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload Option */}
            <Card 
              className={`transition-all duration-300 cursor-pointer ${
                selectedOption === 'upload' 
                  ? 'bg-slate-900/95 border-purple-500 shadow-2xl shadow-purple-500/30' 
                  : 'bg-slate-900/95 border-purple-500/50 hover:border-purple-500'
              }`}
              onClick={() => setSelectedOption('upload')}
            >
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-3">
                  <Upload className="w-6 h-6 text-purple-400" />
                  Upload Image
                </CardTitle>
                <p className="text-gray-300 text-sm">
                  Upload your own artwork to create the series
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                    <span>Upload custom artwork</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                    <span>Automatic NFT collection creation</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                    <span>Redemption codes for each NFT</span>
                  </div>
                </div>
                
                {selectedOption === 'upload' && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <Button 
                      asChild
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      <Link href="/series/upload">
                        Start Upload
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Series Info */}
          <Card className="bg-slate-900/95 border-emerald-500 shadow-2xl shadow-emerald-500/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                What You Get
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-emerald-400 font-semibold">Physical Cards</h4>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-1">•</span>
                      <span>High-quality printed trading cards</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-1">•</span>
                      <span>Professional card design and layout</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-1">•</span>
                      <span>Durable card stock and finish</span>
                    </li>
                  </ul>
                </div>
                
                <div className="space-y-3">
                  <h4 className="text-cyan-400 font-semibold">Digital NFTs</h4>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">•</span>
                      <span>ERC1155 smart contract deployment</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">•</span>
                      <span>Unique redemption codes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-1">•</span>
                      <span>Royalty system for ongoing revenue</span>
                    </li>
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
