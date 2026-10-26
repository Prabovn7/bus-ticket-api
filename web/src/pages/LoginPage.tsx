import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiRequestError } from '../api/client'
import { useAuth } from '../auth/useAuth'
import ErrorMessage from '../components/ErrorMessage'
import Field from '../components/Field'
import HeroScene from '../components/HeroScene'

function messageFor(error: unknown): string {
  if (error instanceof ApiRequestError) {
    // Uma mensagem só para e-mail inexistente e senha errada: não revela quais contas existem.
    return error.code === 'invalid_credentials' ? 'E-mail ou senha incorretos.' : error.message
  }
  return 'Algo deu errado. Tente de novo.'
}

function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // O estado só muda na próxima renderização; o ref bloqueia um segundo envio no mesmo instante.
  const sending = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) {
      return
    }
    sending.current = true
    setSubmitting(true)
    setError(null)

    try {
      await login(email, password)
    } catch (caught) {
      setError(messageFor(caught))
      setSubmitting(false)
      sending.current = false
      return
    }
    void navigate('/')
  }

  return (
    <section>
      <HeroScene title="Entrar" />
      <form className="formulario" onSubmit={handleSubmit}>
        <Field
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Senha"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        <button type="submit" className="botao" disabled={submitting}>
          Entrar
        </button>
      </form>
    </section>
  )
}

export default LoginPage
