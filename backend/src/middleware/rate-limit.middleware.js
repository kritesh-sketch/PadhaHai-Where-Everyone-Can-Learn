export function createRateLimiter({ windowMs, maxRequests, message }) {
  const requests = new Map();
  let callsSinceCleanup = 0;

  const middleware = (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    let entry = requests.get(key);

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      requests.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      res.set("Retry-After", String(Math.ceil((entry.expiresAt - now) / 1000)));
      return res.status(429).json({ message });
    }

    callsSinceCleanup += 1;
    if (callsSinceCleanup >= 1000) {
      for (const [address, requestWindow] of requests) {
        if (requestWindow.expiresAt <= now) requests.delete(address);
      }
      callsSinceCleanup = 0;
    }

    return next();
  };

  middleware.reset = () => requests.clear();
  return middleware;
}
