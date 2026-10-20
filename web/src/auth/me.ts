import type { User } from '../api/types'
import { authedFetch } from './authedFetch'

export function me(): Promise<User> {
  return authedFetch<User>('/api/auth/me')
}
