import { Outlet } from 'react-router'
import { usePageAnnouncement } from '../a11y/usePageAnnouncement'
import Header from './Header'

function Layout() {
  usePageAnnouncement()

  return (
    <>
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" className="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="rodape">
        <p>Projeto de portfólio. Os pagamentos são simulados e nenhum valor é cobrado.</p>
      </footer>
    </>
  )
}

export default Layout
