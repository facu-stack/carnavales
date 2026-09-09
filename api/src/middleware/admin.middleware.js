export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.isAdmin !== true) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
