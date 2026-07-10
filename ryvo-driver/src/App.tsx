import { useState } from 'react'

function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white w-full">
      <div className="p-8 max-w-md w-full bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-800 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white mb-2">RYVO</h1>
        <p className="text-zinc-400 text-lg mb-8 font-medium">Driver Partner</p>
        
        <div className="space-y-4">
          <button className="w-full bg-white text-black font-semibold py-4 rounded-xl hover:bg-zinc-200 transition-colors">
            Login to Drive
          </button>
          <button className="w-full bg-zinc-800 text-white font-semibold py-4 rounded-xl hover:bg-zinc-700 transition-colors">
            Apply to Drive
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
