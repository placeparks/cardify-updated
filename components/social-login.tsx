'use client'

import { useState, useEffect } from 'react'
import { usePrivy, useLoginWithEmail } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Loader2, Mail, MessageSquare, Github, Twitter, Linkedin, Apple } from 'lucide-react'

type OtpFlowState = 
  | { status: 'initial' }
  | { status: 'error'; error: Error | null }
  | { status: 'sending-code' }
  | { status: 'awaiting-code-input' }
  | { status: 'submitting-code' }
  | { status: 'done' }

interface SocialLoginProps {
  onSuccess?: () => void
}

export function SocialLogin({ onSuccess }: SocialLoginProps = {}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [showCodeInput, setShowCodeInput] = useState(false)
  
  const { ready, authenticated, login, logout } = usePrivy()
  const { sendCode, loginWithCode, state } = useLoginWithEmail({
    onComplete: (params) => {
      console.log('Login completed:', params)
      setShowCodeInput(false)
      setEmail('')
      setCode('')
      // Call success callback if provided
      if (onSuccess) {
        onSuccess()
      }
    },
    onError: (error) => {
      console.error('Login error:', error)
    }
  })

  const handleEmailSubmit = async () => {
    if (!email) return
    
    try {
      await sendCode({ email })
      setShowCodeInput(true)
    } catch (error) {
      console.error('Error sending code:', error)
    }
  }

  const handleCodeSubmit = async () => {
    if (!code) return
    
    try {
      await loginWithCode({ code })
    } catch (error) {
      console.error('Error verifying code:', error)
    }
  }

  const handleSocialLogin = (provider: string) => {
    login()
    // Note: onSuccess will be called automatically when login completes
  }

  const handleSMSLogin = () => {
    // SMS login would be handled by Privy's built-in modal
    login()
  }

  // Handle success callback when authentication changes
  useEffect(() => {
    if (authenticated && onSuccess) {
      // Longer delay to prevent flashing and allow proper state transition
      const timer = setTimeout(() => {
        onSuccess()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [authenticated, onSuccess])

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  // If authenticated, show success message briefly
  if (authenticated) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-green-600 mb-2">Success!</h3>
          <p className="text-gray-600">Setting up your wallet...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Sign In to Cardify</CardTitle>
        <CardDescription className="text-center">
          Choose your preferred login method
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email OTP Section */}
        {!showCodeInput ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address
              </label>
              <div className="flex space-x-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  onClick={handleEmailSubmit}
                  disabled={state.status === 'sending-code' || !email}
                  size="sm"
                >
                  {state.status === 'sending-code' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Social Login Buttons */}
            <div className="space-y-2">
              <Button
                onClick={() => handleSocialLogin('google')}
                variant="outline"
                className="w-full justify-start"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>

              <Button
                onClick={() => handleSocialLogin('twitter')}
                variant="outline"
                className="w-full justify-start"
              >
                <Twitter className="mr-2 h-4 w-4 text-blue-400" />
                Continue with Twitter
              </Button>

              <Button
                onClick={() => handleSocialLogin('github')}
                variant="outline"
                className="w-full justify-start"
              >
                <Github className="mr-2 h-4 w-4" />
                Continue with GitHub
              </Button>

              <Button
                onClick={() => handleSocialLogin('discord')}
                variant="outline"
                className="w-full justify-start"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="#5865F2">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Continue with Discord
              </Button>

              <Button
                onClick={() => handleSocialLogin('linkedin')}
                variant="outline"
                className="w-full justify-start"
              >
                <Linkedin className="mr-2 h-4 w-4 text-blue-600" />
                Continue with LinkedIn
              </Button>

              <Button
                onClick={() => handleSocialLogin('apple')}
                variant="outline"
                className="w-full justify-start"
              >
                <Apple className="mr-2 h-4 w-4" />
                Continue with Apple
              </Button>

              <Button
                onClick={handleSMSLogin}
                variant="outline"
                className="w-full justify-start"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Continue with SMS
              </Button>
            </div>
          </div>
        ) : (
          /* Code Input Section */
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                We sent a verification code to <strong>{email}</strong>
              </p>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Verification Code
              </label>
              <div className="flex space-x-2">
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="flex-1"
                  maxLength={6}
                />
                <Button 
                  onClick={handleCodeSubmit}
                  disabled={state.status === 'submitting-code' || !code}
                  size="sm"
                >
                  {state.status === 'submitting-code' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Verify'
                  )}
                </Button>
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCodeInput(false)
                  setCode('')
                }}
              >
                ← Back to email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEmailSubmit}
                disabled={state.status === 'sending-code'}
              >
                Resend code
              </Button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {state.status === 'error' && state.error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {state.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
