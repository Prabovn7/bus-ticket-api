import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiRequestError } from '../api/client'
import { register } from '../auth/authApi'
import { useAuth } from '../auth/useAuth'
import ErrorMessage from '../components/ErrorMessage'
import Field from '../components/Field'
import HeroScene from '../components/HeroScene'

const MIN_PASSWORD_LENGTH = 8

interface FieldErrors {
  name?: string
  email?: string
  password?: string
}

// O que o navegador não pega: `required` aceita só espaços, e a mensagem de senha é nossa.
function validate(name: string, password: string): FieldErrors {
  const errors: FieldErrors = {}
  if (name.trim() === '') {
    errors.name = 'Informe seu nome.'
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = 'Use pelo menos 8 caracteres.'
  }
  return errors
}

function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  // O estado só muda na próxima renderização; o ref bloqueia um segundo envio no mesmo instante.
  const sending = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Depois que os erros aparecem na tela, o foco vai ao primeiro campo inválido (ordem do DOM).
  // Cada falha cria um objeto novo, então uma segunda tentativa também leva o foco de volta.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [fieldErrors])

  function stopSending() {
    setSubmitting(false)
    sending.current = false
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) {
      return
    }

    const errors = validate(name, password)
    if (errors.name || errors.password) {
      setFieldErrors(errors)
      setFormError(null)
      return
    }

    sending.current = true
    setSubmitting(true)
    setFieldErrors({})
    setFormError(null)

    try {
      await register(email, password, name.trim())
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'email_already_registered') {
        setFieldErrors({ email: 'Já existe uma conta com este e-mail.' })
      } else if (caught instanceof ApiRequestError) {
        setFormError(caught.message)
      } else {
        setFormError('Algo deu errado. Tente de novo.')
      }
      stopSending()
      return
    }

    // Daqui em diante a conta já existe: repetir o cadastro daria 409.
    try {
      await login(email, password)
    } catch {
      setFormError('Sua conta foi criada, mas não foi possível entrar agora. Use a tela Entrar.')
      stopSending()
      return
    }
    void navigate('/')
  }

  return (
    <section>
      <HeroScene title="Criar conta" />
      <form ref={formRef} className="formulario" onSubmit={handleSubmit}>
        <Field
          label="Nome"
          type="text"
          name="name"
          autoComplete="name"
          maxLength={120}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />
        <Field
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />
        <Field
          label="Senha"
          type="password"
          name="password"
          autoComplete="new-password"
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />
        {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}
        <button type="submit" className="botao" disabled={submitting}>
          Criar conta
        </button>
      </form>
    </section>
  )
}

export default RegisterPage
