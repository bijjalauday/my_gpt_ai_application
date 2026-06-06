import { useAuth0 } from '@auth0/auth0-react'
import GptChat from './components/GptChat'

// SSO master switch — must match VITE_AUTH_ENABLED in .env.
const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true'

function App() {
  // useAuth0 is always called (Rules of Hooks). When SSO is off there is no
  // <Auth0Provider>, so these values are just defaults and we never use them.
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0()

  // SSO disabled → go straight to the chat, no login required.
  if (!authEnabled) return <GptChat />

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center px-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/25">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 01-5.303 0l-.347-.347z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">My GPT AI</h1>
            <p className="text-gray-500 text-sm">Sign in to start chatting</p>
          </div>
          <button
            onClick={() => loginWithRedirect()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-xl
              transition-colors shadow-lg shadow-indigo-500/20"
          >
            Sign in with Auth0
          </button>
        </div>
      </div>
    )
  }

  return <GptChat />
}

export default App
