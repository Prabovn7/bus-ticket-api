export type Theme = 'claro' | 'escuro'

const KEY = 'tema'

export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'claro' || value === 'escuro' ? value : null
  } catch {
    // Armazenamento bloqueado pelo navegador: seguimos o tema do sistema.
    return null
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Armazenamento bloqueado: a escolha vale só até recarregar a página.
  }
}
