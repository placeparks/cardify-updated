'use client'

import { CreditManagement } from '@/components/credit-management'
import AdminGuard from '@/components/admin-guard'

export default function AdminCreditsPage() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-cyber-black text-white px-3 sm:px-6 pt-16 sm:pt-20 pb-6 sm:pb-10">
        <div className="mx-auto max-w-7xl">
          <CreditManagement />
        </div>
      </div>
    </AdminGuard>
  )
}
