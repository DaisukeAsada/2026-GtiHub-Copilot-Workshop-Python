import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { ChatMessage } from './components/ChatMessage'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const websocketUrl = 'ws://localhost:3001'

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const socket = new WebSocket(websocketUrl)
    socketRef.current = socket

    socket.onopen = () => {
      setIsConnected(true)
    }

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as {
        type: 'delta' | 'done'
        content?: string
      }
      const deltaContent = payload.content

      if (payload.type === 'delta' && typeof deltaContent === 'string' && deltaContent.length > 0) {
        setMessages((currentMessages) => {
          const lastMessage = currentMessages[currentMessages.length - 1]

          if (lastMessage?.role === 'assistant') {
            return [
              ...currentMessages.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + deltaContent,
              },
            ]
          }

          return [
            ...currentMessages,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: deltaContent,
            },
          ]
        })
      }

      if (payload.type === 'done') {
        setIsLoading(false)
      }
    }

    socket.onerror = () => {
      setIsConnected(false)
      setIsLoading(false)
    }

    socket.onclose = () => {
      setIsConnected(false)
      setIsLoading(false)
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedInput = inputText.trim()
    if (!trimmedInput || isLoading || socketRef.current?.readyState !== WebSocket.OPEN) {
      return
    }

    const nextMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
    }

    setMessages((currentMessages) => [...currentMessages, nextMessage])
    setInputText('')
    setIsLoading(true)

    socketRef.current.send(
      JSON.stringify({
        type: 'user_message',
        content: trimmedInput,
      }),
    )
  }

  const showTypingIndicator =
    isLoading && messages[messages.length - 1]?.role !== 'assistant'

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div>
          <p className="chat-eyebrow">Copilot SDK Chat</p>
          <h1>Streaming assistant experience</h1>
        </div>
        <span className={`connection-pill ${isConnected ? 'connected' : 'offline'}`}>
          {isConnected ? 'Connected' : 'Connecting'}
        </span>
      </header>

      <section className="messages-panel" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start a conversation</h2>
            <p>Ask Copilot a question and watch the response stream in real time.</p>
          </div>
        ) : (
          messages.map((message) => <ChatMessage key={message.id} message={message} />)
        )}

        {showTypingIndicator ? (
          <div className="message-row assistant">
            <div className="message assistant typing-indicator" aria-label="Assistant is typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </section>

      <form className="chat-form" onSubmit={handleSubmit}>
        <label className="composer" htmlFor="chat-input">
          <input
            id="chat-input"
            name="message"
            type="text"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder={isConnected ? 'Send a message to Copilot...' : 'Connecting to chat server...'}
            disabled={isLoading || !isConnected}
            autoComplete="off"
          />
          <button type="submit" disabled={isLoading || !inputText.trim() || !isConnected}>
            {isLoading ? 'Waiting...' : 'Send'}
          </button>
        </label>
      </form>
    </main>
  )
}

export default App
