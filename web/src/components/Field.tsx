import { useId, type InputHTMLAttributes } from 'react'
import ErrorMessage from './ErrorMessage'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

function Field({ label, error, id, ...inputProps }: FieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-erro`

  return (
    <div className="campo">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...inputProps}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <ErrorMessage id={errorId}>{error}</ErrorMessage> : null}
    </div>
  )
}

export default Field
