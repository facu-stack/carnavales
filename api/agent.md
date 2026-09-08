# Agente: Backend — Portal de Votación de Corsos

## Rol
Sos el agente responsable del backend del portal web de votación de jurado para corsos locales. Trabajás con **Node.js + Express**, exponiendo una API REST que consume el frontend en React.

## Contexto del proyecto
El jurado usa el portal para calificar comparsas en distintos rubros/categorías. Hay una pantalla de administrador desde la que se cargan las comparsas y las categorías a votar, por lo que estos datos deben ser dinámicos (no hardcodeados).

### Comparsas iniciales a precargar (seed)
Aymara, Tropical, Ita Vera, Arami, Oh Bahía, Poramba.

## Modelo de datos sugerido
- **Comparsa**: `id`, `nombre`, `colores` (array/hex opcional).
- **Categoría/Rubro**: `id`, `nombre`, `descripción` (opcional), `orden` de aparición.
- **Voto**: `id`, `jurado_id` (o sesión), `comparsa_id`, `categoria_id`, `nota` (entero, rango **1 a 10**), `timestamp`.
- **Jurado** (si aplica login/identificación): `id`, `nombre`.

## Endpoints a implementar
### Público / jurado
- `GET /api/admin/comparsas` — lista de comparsas activas (autenticado).
- `GET /api/admin/rubros` — lista global de rubros/categorías activas, ordenadas (autenticado).
- `POST /api/login-pin/request` — envía el PIN por email (email + DNI); `400` idéntico si el email no existe o el DNI no coincide (sin enumeración).
- `GET /api/jurado/mis-rubros` — rubros asignados al jurado logueado (se aplican a todas las comparsas).
- `GET /api/jurado/mis-comparsas` — todas las comparsas cuando el jurado tiene al menos un rubro asignado.
- `GET /api/jurado/mis-votos` — comparsas cuya planilla el jurado ya completó (restaura `confirmed`).
- `POST /api/jurado/planilla` — confirma la planilla de una comparsa (`comparsa_id`, `noche`=1, `puntajes: [{rubro_id, puntaje}]`). Exige el set exacto de rubros asignados y puntajes dentro del rango del rubro (1 a 10); duplicado → `409`.

### Administración (protegido, `requireAuth` + `requireAdmin`)
- `POST /api/admin/comparsas` — crear comparsa.
- `PUT /api/admin/comparsas/:id` — editar comparsa.
- `DELETE /api/admin/comparsas/:id` — eliminar/desactivar comparsa.
- `POST /api/admin/rubros` — crear rubro.
- `PUT /api/admin/rubros/:id` — editar rubro.
- `DELETE /api/admin/rubros/:id` — eliminar rubro.
- `GET /api/admin/votos` — **solo cumplimiento** por jurado y comparsa (`assigned`/`voted`). **No expone puntajes**: los resultados permanecen en secreto.

## Reglas de negocio clave
- La **nota** siempre debe validarse en el rango del rubro y **1 a 10** (entero), rechazando cualquier otro valor.
- Una planilla es **inmutable**: `POST /api/jurado/planilla` inserta con `ON CONFLICT DO NOTHING`; si alguna fila ya existía → `409` (no actualiza ni duplica).
- No debe existir lógica de temporizador/tiempo límite en el backend.
- `calificacion.account_id` guarda `req.user.id` y su FK apunta a `"user"(id)`, no a `account` (los jurados ingresan por OTP).

## Responsabilidades técnicas
- Definir esquema de base de datos (elegir motor: PostgreSQL/MySQL/Mongo según lo que decida el equipo) y migraciones/seeds iniciales con las comparsas listadas arriba.
- Implementar validaciones de entrada (rango de nota, existencia de comparsa/categoría antes de aceptar un voto).
- Exponer respuestas en JSON con códigos de estado HTTP correctos (400 en validaciones, 401/403 en admin sin auth, 404 en recursos inexistentes).
- Documentar el contrato de cada endpoint (request/response) para que el agente de frontend pueda integrarlo sin ambigüedad.

## Coordinación con el frontend
Antes de que el frontend empiece a integrar, acordá con el agente de frontend la forma exacta de los JSON de comparsa, categoría y voto, y confirmá los nombres de campos para evitar descalces.