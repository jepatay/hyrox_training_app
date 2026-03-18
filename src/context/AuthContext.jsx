import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authorized, setAuthorized] = useState(null) // null = checking

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('access')
    const stored = sessionStorage.getItem('access_token')

    if (token) {
      sessionStorage.setItem('access_token', token)
      setAuthorized(token)
    } else if (stored) {
      setAuthorized(stored)
    } else {
      setAuthorized(false)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ authorized }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
