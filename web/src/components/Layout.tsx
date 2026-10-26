import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { usePageAnnouncement } from '../a11y/usePageAnnouncement'
import { useReducedMotion } from '../motion/useReducedMotion'
import Header from './Header'

gsap.registerPlugin(useGSAP)

function Layout() {
  usePageAnnouncement()
  const { pathname } = useLocation()
  const reduced = useReducedMotion()
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)

  // Só anima quando a rota muda de verdade: nem no carregamento inicial (nem no StrictMode, que
  // roda o efeito duas vezes), nem ao clicar no link da própria rota. Não há saída animada:
  // a tela antiga some na hora e a nova entra com um fade curto (só opacity e transform).
  useGSAP(
    () => {
      if (previousPath.current === pathname) {
        return
      }
      previousPath.current = pathname
      if (reduced || !main.current) {
        return
      }
      gsap.fromTo(
        main.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out', clearProps: 'opacity,transform' },
      )
    },
    { dependencies: [pathname, reduced], revertOnUpdate: true },
  )

  return (
    <>
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Header />
      <main ref={main} id="conteudo" className="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="rodape">
        <p>Projeto de portfólio. Os pagamentos são simulados e nenhum valor é cobrado.</p>
      </footer>
    </>
  )
}

export default Layout
