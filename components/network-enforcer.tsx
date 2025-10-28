'use client'

import useEnsureBaseSepolia from '@/hooks/useEnsureNetwork'

/**
 * Component that enforces Base Sepolia network connection
 * Should be used in the root layout to ensure all pages enforce the correct network
 */
export default function NetworkEnforcer() {
  useEnsureBaseSepolia()
  return null // This component doesn't render anything
}
