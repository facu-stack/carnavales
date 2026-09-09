import { VALID_ROLES } from "../auth/permissions.js";

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const role = req.user.role;

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(403).json({ error: "Invalid role" });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}
