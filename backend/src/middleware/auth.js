export function authMiddleware(req, res, next) {
  const token = req.headers['x-access-token'] || req.query.access
  const secret = process.env.ACCESS_TOKEN

  if (!secret) {
    return res.status(500).json({ error: 'ACCESS_TOKEN not configured on server' })
  }

  if (!token || token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  next()
}
