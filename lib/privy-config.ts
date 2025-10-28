import type { PrivyClientConfig } from '@privy-io/react-auth'

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['wallet', 'google'],

  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
  },

  externalWallets: {
    walletConnect: { enabled: true }, 
  },

  appearance: {
    // Order matters: Rabby first → any other injected wallets → WalletConnect
    walletList: [      
      'metamask', 
      'wallet_connect',            
    ],
  },
}
