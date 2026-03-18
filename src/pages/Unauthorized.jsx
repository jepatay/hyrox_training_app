import { ShieldOff } from 'lucide-react'

export default function Unauthorized() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <ShieldOff className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Unauthorized
          </h1>
          <p className="text-muted-foreground text-sm">
            Access to this application requires a valid token.
          </p>
          <p className="text-muted-foreground text-xs font-mono mt-2 bg-muted rounded px-3 py-2">
            /?access=YOUR_SECRET_TOKEN
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          This is a private personal training tracker. If you believe you have access, append{' '}
          <code className="text-primary">?access=...</code> to the URL.
        </p>
      </div>
    </div>
  )
}
