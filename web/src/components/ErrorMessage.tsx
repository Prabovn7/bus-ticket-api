import type { ReactNode } from 'react'

function AlertIcon() {
  return (
    <svg className="icone-erro" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </svg>
  )
}

interface ErrorMessageProps {
  id?: string
  children: ReactNode
}

function ErrorMessage({ id, children }: ErrorMessageProps) {
  return (
    <p id={id} className="erro-aviso" role="alert">
      <AlertIcon />
      <span>{children}</span>
    </p>
  )
}

export default ErrorMessage
