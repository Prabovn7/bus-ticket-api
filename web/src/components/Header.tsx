import { Link, NavLink } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useTheme } from '../theme/useTheme'

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function Header() {
  const { effective, toggle } = useTheme()
  const { status, user, logout } = useAuth()
  const next = effective === 'escuro' ? 'claro' : 'escuro'

  function handleLogout() {
    logout().catch(() => {
      // O AuthProvider já deixa a sessão anônima mesmo quando a chamada falha.
    })
  }

  return (
    <header className="topo">
      <div className="topo-interno">
        <Link to="/" className="marca">
          ônibora
        </Link>
        <nav aria-label="Principal" className="topo-nav">
          <NavLink to="/" end>
            Buscar
          </NavLink>
          {status === 'anonymous' ? (
            <>
              <NavLink to="/entrar">Entrar</NavLink>
              <NavLink to="/criar-conta">Criar conta</NavLink>
            </>
          ) : null}
        </nav>
        {status === 'authenticated' && user ? (
          <div className="topo-usuario">
            <span className="topo-nome">{user.name}</span>
            <button type="button" className="botao-sair" onClick={handleLogout}>
              Sair
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="botao-tema"
          onClick={toggle}
          aria-label={`Mudar para o tema ${next}`}
        >
          {effective === 'claro' ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </header>
  )
}

export default Header
