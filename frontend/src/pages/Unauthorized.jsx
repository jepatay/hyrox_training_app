export default function Unauthorized() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">Unauthorized</h1>
        <p className="text-muted-foreground mb-6">
          Access to this app requires a valid token in the URL.
        </p>
        <div className="bg-card border border-border rounded-xl p-4 text-left">
          <p className="text-xs text-muted-foreground mb-2 font-mono">Example URL:</p>
          <code className="text-sm text-primary font-mono break-all">
            https://your-app.com/?access=YOUR_SECRET_TOKEN
          </code>
        </div>
      </div>
    </div>
  );
}
