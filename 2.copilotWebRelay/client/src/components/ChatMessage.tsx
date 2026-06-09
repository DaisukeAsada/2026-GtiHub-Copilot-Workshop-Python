import ReactMarkdown from 'react-markdown'

type ChatMessageProps = {
  message: {
    role: 'user' | 'assistant'
    content: string
  }
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className={`message-row ${message.role}`}>
      <article className={`message ${message.role}`}>
        {message.role === 'assistant' ? (
          <ReactMarkdown>{message.content}</ReactMarkdown>
        ) : (
          <p>{message.content}</p>
        )}
      </article>
    </div>
  )
}
