'use client'
import { useRouter } from 'next/navigation'

export default function EquipmentPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <button onClick={() => router.push('/dashboard')} 
              className="text-green-700 font-medium mb-6 flex items-center gap-2">
        ← Back to Dashboard
      </button>
      <div className="max-w-4xl mx-auto text-center py-20">
        <div className="text-6xl mb-4">🔧</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Equipment</h1>
        <p className="text-gray-500">Service schedules, due dates and maintenance alerts</p>
        <p className="text-sm text-green-600 mt-4 bg-green-50 px-4 py-2 rounded-xl inline-block">Coming soon</p>
      </div>
    </div>
  )
}