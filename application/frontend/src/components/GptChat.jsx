import React, { useState, useRef, useEffect } from 'react'
import {
  Play,
  MessageSquare,
  FileText,
  FilePlus,
  Send,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Brain,
  DollarSign,
  Hash,
  Thermometer,
  Settings,
  X,
  User,
  AlertTriangle,
  Zap,
  Sparkles,
  Wifi,
  WifiOff,
  LogOut,
} from 'lucide-react'
import { useAuth0 } from '@auth0/auth0-react'
import { sendChatCompletion, sendChatStream } from '../services/api'

const MODELS = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o']

const NAV_ITEMS = [
  { id: 'start',   icon: Play,          label: 'Start'        },
  { id: 'chat',    icon: MessageSquare, label: 'Chat'         },
  { id: 'sources', icon: FileText,      label: 'Sources'      },
  { id: 'add-doc', icon: FilePlus,      label: 'Add Document' },
]

const SUGGESTIONS = [
  'Summarize a document',
  'Answer questions from sources',
  'Analyze data patterns',
  'Generate a structured report',
]

function NavButton({ item, active, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={() => onClick(item.id)}
      title={item.label}
      className={`relative w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all group
        ${active
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
          : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[8px] font-medium leading-none tracking-wide">
        {item.label.split(' ')[0]}
      </span>
      {/* Tooltip */}
      <span className="absolute left-14 bg-gray-800 border border-gray-700 text-white text-xs px-2.5 py-1.5 rounded-lg
        opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl">
        {item.label}
      </span>
    </button>
  )
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-indigo-500/20">
          <Brain className="w-4 h-4 text-white" />
        </div>
      )}
      <div className="max-w-2xl flex flex-col">
        <div
          className={`px-4 py-3 text-sm leading-relaxed
            ${isUser
              ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm shadow-lg shadow-indigo-500/15'
              : 'bg-gray-800 text-gray-200 rounded-2xl rounded-tl-sm border border-gray-700/60'}`}
        >
          {msg.content}
        </div>
        <span className="text-[10px] text-gray-600 mt-1 px-1">{msg.timestamp}</span>
      </div>
      {isUser && (
        <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-gray-300" />
        </div>
      )}
    </div>
  )
}

function Toggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2"
      aria-pressed={enabled}
      aria-label="Toggle memory"
    >
      <div
        className={`w-10 h-6 rounded-full transition-colors duration-200 relative
          ${enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
      >
        <div
          className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200
            ${enabled ? 'left-5' : 'left-1'}`}
        />
      </div>
      <span className={`text-xs font-semibold w-7 ${enabled ? 'text-indigo-400' : 'text-gray-500'}`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

function SliderField({ icon: Icon, label, min, max, step, value, onChange, formatValue, minLabel, maxLabel }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </label>
        <span className="text-sm font-semibold text-indigo-400">{formatValue ? formatValue(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between text-[10px] text-gray-600 mt-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}

export default function GptChat() {
  const { user, logout, getAccessTokenSilently } = useAuth0()

  const [messages, setMessages]         = useState([])
  const [inputText, setInputText]       = useState('')
  const [temperature, setTemperature]   = useState(0.7)
  const [maxTokens, setMaxTokens]       = useState(8000)
  const [selectedModel, setModel]       = useState('gpt-3.5-turbo')
  const [memoryOn, setMemoryOn]         = useState(true)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [activeNav, setActiveNav]       = useState('chat')
  const [rightPanel, setRightPanel]     = useState(true)
  const [costOpen, setCostOpen]         = useState(false)
  const [isTyping, setIsTyping]         = useState(false)
  const [streamMode, setStreamMode]     = useState(true)
  const [errorMsg, setErrorMsg]         = useState(null)

  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Build the messages array to send to the API.
  // When memory is OFF, only send the latest user message.
  const buildApiMessages = (history, latestUserContent) => {
    const latest = { role: 'user', content: latestUserContent }
    if (!memoryOn) return [latest]
    return [
      ...history.map(m => ({ role: m.role, content: m.content })),
      latest,
    ]
  }

  const handleSend = async () => {
    if (!inputText.trim() || isTyping) return

    setErrorMsg(null)
    const userContent = inputText.trim()
    const userMsg = {
      id:        Date.now(),
      role:      'user',
      content:   userContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages(prev => [...prev, userMsg])
    setInputText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setIsTyping(true)

    let token = ''
    try {
      token = await getAccessTokenSilently({
        authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
      })
    } catch (err) {
      setErrorMsg('Session expired — please sign in again')
      setIsTyping(false)
      return
    }

    const apiMessages = buildApiMessages(messages, userContent)
    const params = {
      messages:     apiMessages,
      model:        selectedModel,
      temperature,
      maxTokens,
      systemPrompt: systemPrompt || null,
      token,
    }

    if (streamMode) {
      // ── Streaming path ────────────────────────────────────────────────────
      const assistantId = Date.now() + 1
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

      // Insert an empty assistant bubble immediately
      setMessages(prev => [...prev, {
        id:        assistantId,
        role:      'assistant',
        content:   '',
        timestamp: ts,
      }])
      setIsTyping(false)

      await sendChatStream({
        ...params,
        onDelta: (delta) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m
          ))
        },
        onDone: () => { /* already inserted */ },
        onError: (err) => {
          setErrorMsg(err)
          // Remove the empty assistant bubble on error
          setMessages(prev => prev.filter(m => m.id !== assistantId))
        },
      })
    } else {
      // ── Non-streaming path ────────────────────────────────────────────────
      try {
        const content = await sendChatCompletion(params)
        setMessages(prev => [...prev, {
          id:        Date.now() + 1,
          role:      'assistant',
          content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }])
      } catch (err) {
        setErrorMsg(err.message || 'Request failed')
      } finally {
        setIsTyping(false)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaInput = (e) => {
    setInputText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
  }

  const estimatedCost = selectedModel.includes('gpt-4')
    ? ((maxTokens / 1000) * 0.03).toFixed(4)
    : ((maxTokens / 1000) * 0.002).toFixed(4)

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden font-sans">

      {/* ── Left Sidebar ── */}
      <nav className="w-16 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4 shrink-0">

        {/* Brand / Logo */}
        <div className="mb-5 w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Brain className="w-5 h-5 text-white" />
        </div>

        {/* Nav Items */}
        <div className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(item => (
            <NavButton
              key={item.id}
              item={item}
              active={activeNav === item.id}
              onClick={setActiveNav}
            />
          ))}
        </div>

        {/* Disclaimer */}
        <div className="flex flex-col items-center gap-1 pt-3 border-t border-gray-800 w-full px-2">
          <div
            className="w-10 h-10 bg-amber-900/20 rounded-xl flex items-center justify-center border border-amber-700/20"
            title="No highly confidential data"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-[7px] text-amber-500/60 text-center leading-tight">
            No highly<br />confidential data
          </p>
        </div>
      </nav>

      {/* ── Main Chat Area ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-14 bg-gray-900/80 backdrop-blur border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow shadow-indigo-500/30">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">Gpt</h1>
            <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-700/40 font-medium">
              AI
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
              <div className={`w-1.5 h-1.5 rounded-full ${memoryOn ? 'bg-green-400' : 'bg-gray-600'}`} />
              <span>{selectedModel}</span>
              <span className="text-gray-700">·</span>
              <span>Memory {memoryOn ? 'ON' : 'OFF'}</span>
              <span className="text-gray-700">·</span>
              <button
                onClick={() => setStreamMode(v => !v)}
                title={streamMode ? 'Streaming ON — click to disable' : 'Streaming OFF — click to enable'}
                className={`flex items-center gap-1 transition-colors ${streamMode ? 'text-indigo-400' : 'text-gray-600'}`}
              >
                {streamMode ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {streamMode ? 'Stream' : 'Batch'}
              </button>
            </div>
            <button
              onClick={() => setRightPanel(p => !p)}
              title="Toggle parameters panel"
              className="text-gray-400 hover:text-white hover:bg-gray-800 p-2 rounded-lg transition-all"
            >
              {rightPanel ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* User avatar + logout */}
            <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
              {user?.picture
                ? <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
                : <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-300" />
                  </div>
              }
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                title="Sign out"
                className="text-gray-500 hover:text-red-400 hover:bg-gray-800 p-1.5 rounded-lg transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Error Banner */}
        {errorMsg && (
          <div className="mx-6 mt-3 flex items-start gap-2 bg-red-950/50 border border-red-700/40 text-red-300 text-xs px-4 py-3 rounded-xl">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center select-none">
              <div className="w-16 h-16 bg-indigo-900/30 rounded-2xl flex items-center justify-center border border-indigo-700/25 shadow-xl shadow-indigo-500/5">
                <Sparkles className="w-7 h-7 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">How can I help you today?</h2>
                <p className="text-gray-500 text-sm">Gpt is ready. Select a suggestion or type your own prompt below.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setInputText(s)}
                    className="text-left p-3.5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/40 hover:border-gray-600
                      rounded-xl text-sm text-gray-400 hover:text-gray-200 transition-all leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-gray-800 border border-gray-700/60 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/30 shrink-0">
          <div className="flex gap-3 items-end bg-gray-800/80 rounded-2xl border border-gray-700 focus-within:border-indigo-500/60 transition-colors p-3 shadow-inner">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Type your prompt..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 resize-none outline-none leading-6 min-h-[24px]"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isTyping}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0
                ${inputText.trim() && !isTyping
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:scale-105'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-600 text-center mt-2">
            Press <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-500 text-[9px]">Enter</kbd> to send ·{' '}
            <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-500 text-[9px]">Shift+Enter</kbd> for new line
          </p>
        </div>
      </main>

      {/* ── Right Configuration Panel ── */}
      {rightPanel && (
        <aside className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto shrink-0">

          {/* Panel Header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white tracking-wide">Parameters</h2>
            </div>
            <button
              onClick={() => setRightPanel(false)}
              className="text-gray-500 hover:text-gray-300 hover:bg-gray-800 p-1.5 rounded-lg transition-all"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 p-4 space-y-5 overflow-y-auto">

            {/* Model Selection */}
            <div>
              <label className="text-[10px] font-semibold text-gray-500 block mb-2 uppercase tracking-widest">
                Select Models <span className="text-gray-700 normal-case font-normal">(Max 1)</span>
              </label>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 text-sm text-gray-200 rounded-lg
                    px-3 py-2.5 appearance-none focus:outline-none focus:border-indigo-500/70 transition-colors cursor-pointer"
                >
                  {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-800" />

            {/* Temperature */}
            <SliderField
              icon={Thermometer}
              label="Temperature"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(v) => setTemperature(parseFloat(v.toFixed(1)))}
              minLabel="Precise"
              maxLabel="Creative"
            />

            {/* Number of Tokens */}
            <SliderField
              icon={Hash}
              label="Number of Tokens"
              min={256}
              max={16000}
              step={256}
              value={maxTokens}
              onChange={(v) => setMaxTokens(Math.round(v))}
              formatValue={(v) => v.toLocaleString()}
              minLabel="256"
              maxLabel="16,000"
            />

            {/* Divider */}
            <div className="h-px bg-gray-800" />

            {/* Memory Toggle */}
            <div className="flex items-center justify-between py-3 px-3 bg-gray-800/50 rounded-xl border border-gray-700/40">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-gray-300 font-medium">Memory</span>
              </div>
              <Toggle enabled={memoryOn} onToggle={() => setMemoryOn(v => !v)} />
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-800" />

            {/* Cost Calculator */}
            <div className="bg-gray-800/40 rounded-xl border border-gray-700/40 overflow-hidden">
              <button
                onClick={() => setCostOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-800/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300 font-medium">Cost Calculator</span>
                </div>
                {costOpen
                  ? <ChevronUp className="w-4 h-4 text-gray-500" />
                  : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>

              {costOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-700/40 pt-3">
                  {[
                    ['Model',      selectedModel],
                    ['Max Tokens', maxTokens.toLocaleString()],
                    ['Messages',   messages.length],
                    ['Rate / 1K',  selectedModel.includes('gpt-4') ? '$0.030' : '$0.002'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-300">{v}</span>
                    </div>
                  ))}
                  <div className="h-px bg-gray-700 my-1" />
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-gray-400">Est. Cost</span>
                    <span className="text-green-400">${estimatedCost}</span>
                  </div>
                </div>
              )}
            </div>

            {/* System Prompt */}
            <div>
              <label className="text-[10px] font-semibold text-gray-500 block mb-2 uppercase tracking-widest">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant…"
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 text-sm text-gray-200
                  placeholder-gray-600 rounded-lg px-3 py-2.5 resize-none focus:outline-none
                  focus:border-indigo-500/70 transition-colors leading-relaxed"
              />
              <p className="text-[10px] text-gray-600 mt-1">{systemPrompt.length} characters</p>
            </div>

          </div>

          {/* Panel Footer */}
          <div className="p-4 border-t border-gray-800 shrink-0">
            <button className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold
              py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/15">
              <Zap className="w-4 h-4" />
              Apply Settings
            </button>
          </div>
        </aside>
      )}

    </div>
  )
}
