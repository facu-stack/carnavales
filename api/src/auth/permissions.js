export const ROLES = {
  JURADO: "jurado",
  COMISARIO: "comisario",
  ESCRIBANO: "escribano",
  ADMIN: "admin",
};

export const VALID_ROLES = Object.values(ROLES);

export const PERMISSIONS = {
  [ROLES.JURADO]: [
    "votar:crear",
    "votar:borrador",
    "votar:confirmar",
    "votar:ver_propio",
    "noche:ver_asignadas",
  ],
  [ROLES.COMISARIO]: [
    "incidencia:crear",
    "incidencia:ver_propias",
    "control:crear",
    "control:ver_propios",
    "infraccion:ver",
    "noche:ver_asignadas",
  ],
  [ROLES.ESCRIBANO]: [
    "auditoria:ver",
    "acta:ver",
    "acta:certificar",
    "votacion:ver_estado",
    "planilla:ver_estado",
  ],
  [ROLES.ADMIN]: [
    "user:manage",
    "comparsa:manage",
    "rubro:manage",
    "noche:manage",
    "asignacion:manage",
    "incidencia:manage",
    "sancion:manage",
    "infraccion:manage",
    "control:ver",
    "resultados:ver",
    "resultados:publicar",
    "escrutinio:ejecutar",
    "acta:generar",
    "acta:ver",
    "acta:certificar",
    "reporte:ver",
    "auditoria:ver",
    "votos:ver_estado",
  ],
};

export function hasPermission(role, permission) {
  const perms = PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}

export function roleDefaultPath(role) {
  switch (role) {
    case ROLES.ADMIN:
      return "/admin";
    case ROLES.COMISARIO:
      return "/comisario";
    case ROLES.ESCRIBANO:
      return "/escribano";
    case ROLES.JURADO:
    default:
      return "/home";
  }
}
