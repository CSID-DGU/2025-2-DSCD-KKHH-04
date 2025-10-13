import { useState } from 'react'
import viteLogo from '/vite.svg'
import reactLogo from './assets/react.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-center bg-white text-gray-900">
      {/* 로고 */}
      <div className="flex items-center justify-center gap-12">
        <a href="https://vitejs.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      {/* 텍스트 + 버튼 */}
      <h1 className="text-4xl font-bold">Vite + React</h1>

      <button
        onClick={() => setCount((count) => count + 1)}
        className="rounded-lg bg-amber-500 px-4 py-2 text-white hover:bg-amber-600 transition"
      >
        count is {count}
      </button>

      <p className="text-gray-500">
        Edit <code>src/App.tsx</code> and save to test HMR
      </p>
      <p className="text-gray-400">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
