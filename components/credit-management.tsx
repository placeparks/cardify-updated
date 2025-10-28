'use client'

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Search, 
  Plus, 
  Minus, 
  Users, 
  Coins, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertTriangle,
  User,
  Mail,
  Calendar
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface UserProfile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  credits: number
  is_admin: boolean
  upload_count: number
  upload_package_count: number
  free_generations_used: number
  created_at: string
  updated_at: string
}

interface CreditTransaction {
  id: string
  user_id: string
  amount: number
  type: 'add' | 'subtract'
  reason: string
  admin_id: string
  created_at: string
  profiles?: {
    email: string
    display_name: string | null
  }
}

export function CreditManagement() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [creditAmount, setCreditAmount] = useState<number>(0)
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([])
  
  const { toast } = useToast()
  const supabase = createClientComponentClient()

  // Load users and recent transactions
  useEffect(() => {
    loadUsers()
    loadRecentTransactions()
  }, [])

  // Filter users based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users)
    } else {
      const filtered = users.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.display_name && user.display_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        user.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredUsers(filtered)
    }
  }, [searchTerm, users])

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setUsers(data || [])
      setFilteredUsers(data || [])
    } catch (error) {
      console.error('Error loading users:', error)
      setError('Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  const loadRecentTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select(`
          *,
          profiles!credit_transactions_user_id_fkey(email, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setRecentTransactions(data || [])
    } catch (error) {
      console.error('Error loading transactions:', error)
    }
  }

  const handleCreditUpdate = async (type: 'add' | 'subtract') => {
    if (!selectedUser || creditAmount <= 0) {
      toast({
        title: "Invalid Input",
        description: "Please select a user and enter a valid credit amount",
        variant: "destructive"
      })
      return
    }

    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for this credit change",
        variant: "destructive"
      })
      return
    }

    try {
      setIsProcessing(true)
      setError(null)
      setSuccess(null)

      // Use API endpoint instead of direct database calls
      const response = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: creditAmount,
          type: type,
          reason: reason
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update credits')
      }

      const result = await response.json()
      console.log('✅ Credit update result:', result)

      // Update local state
      const newCredits = result.user.new_credits
      setUsers(prev => prev.map(u => 
        u.id === selectedUser.id 
          ? { ...u, credits: newCredits }
          : u
      ))

      // Update selected user
      setSelectedUser(prev => prev ? { ...prev, credits: newCredits } : null)

      // Clear form
      setCreditAmount(0)
      setReason("")

      // Reload transactions
      loadRecentTransactions()

      toast({
        title: "Credits Updated",
        description: `Successfully ${type === 'add' ? 'added' : 'subtracted'} ${creditAmount} credits for ${selectedUser.email}`,
      })

      setSuccess(`Credits ${type === 'add' ? 'added' : 'subtracted'} successfully!`)

    } catch (error) {
      console.error('Error updating credits:', error)
      setError(error instanceof Error ? error.message : 'Failed to update credits')
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : 'Failed to update credits',
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFixCredits = async () => {
    if (!selectedUser) {
      toast({
        title: "No User Selected",
        description: "Please select a user to fix credits",
        variant: "destructive"
      })
      return
    }

    try {
      setIsProcessing(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/admin/credits/fix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fix credits')
      }

      const result = await response.json()
      console.log('✅ Fix credits result:', result)

      // Update local state
      const newCredits = result.data.newCredits
      setUsers(prev => prev.map(u => 
        u.id === selectedUser.id 
          ? { ...u, credits: newCredits }
          : u
      ))

      // Update selected user
      setSelectedUser(prev => prev ? { ...prev, credits: newCredits } : null)

      // Reload transactions
      loadRecentTransactions()

      toast({
        title: "Credits Fixed",
        description: `Successfully fixed credits for ${selectedUser.email}. New balance: ${newCredits}`,
      })

      setSuccess(`Credits fixed successfully! New balance: ${newCredits}`)

    } catch (error) {
      console.error('Error fixing credits:', error)
      setError(error instanceof Error ? error.message : 'Failed to fix credits')
      toast({
        title: "Fix Failed",
        description: error instanceof Error ? error.message : 'Failed to fix credits',
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-cyber-cyan" />
        <span className="ml-2 text-gray-400">Loading users...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-cyber-cyan">Credit Management</h2>
          <p className="text-sm sm:text-base text-gray-400">Manage user credits and view transaction history</p>
        </div>
        <Badge variant="outline" className="border-cyber-cyan/30 text-cyber-cyan self-start sm:self-auto">
          {users.length} Total Users
        </Badge>
      </div>

      {/* Search and User Selection */}
      <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-cyber-cyan text-lg">User Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by email, name, or user ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-cyber-dark/80 border-cyber-cyan/50 text-white text-sm sm:text-base"
            />
          </div>

          {/* User List */}
          <div className="max-h-48 sm:max-h-60 overflow-y-auto space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`p-2 sm:p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedUser?.id === user.id
                    ? 'border-cyber-cyan bg-cyber-cyan/10'
                    : 'border-gray-600 hover:border-cyber-cyan/50 hover:bg-cyber-dark/40'
                }`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-cyber-cyan/20 flex items-center justify-center flex-shrink-0">
                      <User className="h-3 w-3 sm:h-4 sm:w-4 text-cyber-cyan" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium text-sm sm:text-base truncate">
                        {user.display_name || user.email}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-400 truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-cyber-green font-bold text-sm sm:text-base">{user.credits} credits</p>
                    {user.is_admin && (
                      <Badge className="bg-cyber-pink text-black text-xs">Admin</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Credit Management Form */}
      {selectedUser && (
        <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-cyber-cyan text-lg">
              <span className="hidden sm:inline">Manage Credits for </span>
              <span className="sm:hidden">Credits for </span>
              <span className="truncate block sm:inline">
                {selectedUser.display_name || selectedUser.email}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="creditAmount" className="text-cyber-cyan text-sm">Credit Amount</Label>
                <Input
                  id="creditAmount"
                  type="number"
                  min="1"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                  className="bg-cyber-dark/80 border-cyber-cyan/50 text-white text-sm sm:text-base"
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <Label htmlFor="reason" className="text-cyber-cyan text-sm">Reason</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="bg-cyber-dark/80 border-cyber-cyan/50 text-white text-sm sm:text-base"
                  placeholder="Reason for credit change"
                />
              </div>
            </div>

            {error && (
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-400">{success}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                onClick={() => handleCreditUpdate('add')}
                disabled={isProcessing || creditAmount <= 0 || !reason.trim()}
                className="bg-cyber-green hover:bg-cyber-green/80 text-black font-semibold text-sm sm:text-base py-2 sm:py-3"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Credits
              </Button>
              <Button
                onClick={() => handleCreditUpdate('subtract')}
                disabled={isProcessing || creditAmount <= 0 || !reason.trim() || creditAmount > selectedUser.credits}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold text-sm sm:text-base py-2 sm:py-3"
              >
                <Minus className="w-4 h-4 mr-2" />
                Subtract Credits
              </Button>
              <Button
                onClick={handleFixCredits}
                disabled={isProcessing}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm sm:text-base py-2 sm:py-3"
              >
                <Coins className="w-4 h-4 mr-2" />
                Fix Credits
              </Button>
            </div>

            {isProcessing && (
              <div className="flex items-center text-cyber-cyan">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card className="bg-cyber-dark/60 border border-cyber-cyan/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-cyber-cyan text-lg">Recent Credit Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 sm:space-y-3">
            {recentTransactions.length === 0 ? (
              <p className="text-gray-400 text-center py-4 text-sm">No recent transactions</p>
            ) : (
              recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-2 sm:p-3 bg-cyber-dark/40 rounded-lg border border-gray-600"
                >
                  <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      transaction.type === 'add' 
                        ? 'bg-green-500/20' 
                        : 'bg-red-500/20'
                    }`}>
                      {transaction.type === 'add' ? (
                        <Plus className="h-3 w-3 sm:h-4 sm:w-4 text-green-400" />
                      ) : (
                        <Minus className="h-3 w-3 sm:h-4 sm:w-4 text-red-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium text-sm sm:text-base truncate">
                        {transaction.profiles?.display_name || transaction.profiles?.email || 'Unknown User'}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-400 truncate">{transaction.reason}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className={`font-bold text-sm sm:text-base ${
                      transaction.type === 'add' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {transaction.type === 'add' ? '+' : '-'}{transaction.amount} credits
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(transaction.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
