import type { RouteObject } from 'react-router'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SearchPage from './pages/SearchPage'
import TripPage from './pages/TripPage'

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <SearchPage />, handle: { title: 'Buscar viagens' } },
      { path: '/entrar', element: <LoginPage />, handle: { title: 'Entrar' } },
      { path: '/criar-conta', element: <RegisterPage />, handle: { title: 'Criar conta' } },
      { path: '/viagens/:tripId', element: <TripPage />, handle: { title: 'Escolher assento' } },
    ],
  },
]
