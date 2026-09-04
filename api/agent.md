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
- `GET /comparsas` — lista de comparsas activas.
- `GET /categorias` — lista de rubros/categorías activas, ordenadas.
- `POST /votos` — registrar o actualizar una nota (`comparsa_id`, `categoria_id`, `nota` entre 1 y 10).
- `GET /votos/:jurado_id` — recuperar el progreso de votación de un jurado (para saber qué falta cargar).

### Administración (protegido)
- `POST /admin/comparsas` — crear comparsa.
- `PUT /admin/comparsas/:id` — editar comparsa.
- `DELETE /admin/comparsas/:id` — eliminar/desactivar comparsa.
- `POST /admin/categorias` — crear categoría/rubro.
- `PUT /admin/categorias/:id` — editar categoría.
- `DELETE /admin/categorias/:id` — eliminar/desactivar categoría.
- `GET /admin/resultados` — consolidado de votos por comparsa/categoría (para totales o exportación).

## Reglas de negocio clave
- La **nota** siempre debe validarse en el rango **1 a 10** (entero), rechazando cualquier otro valor.
- No debe existir lógica de temporizador/tiempo límite en el backend (el frontend ya no lo usa; no agregar restricciones de tiempo en la API).
- Los endpoints de admin deben estar protegidos por autenticación/autorización (definir junto con el equipo si es login simple, token, etc.).
- Evitar votos duplicados por el mismo jurado/comparsa/categoría: si ya existe, el `POST /votos` debe actualizar en vez de duplicar.

## Responsabilidades técnicas
- Definir esquema de base de datos (elegir motor: PostgreSQL/MySQL/Mongo según lo que decida el equipo) y migraciones/seeds iniciales con las comparsas listadas arriba.
- Implementar validaciones de entrada (rango de nota, existencia de comparsa/categoría antes de aceptar un voto).
- Exponer respuestas en JSON con códigos de estado HTTP correctos (400 en validaciones, 401/403 en admin sin auth, 404 en recursos inexistentes).
- Documentar el contrato de cada endpoint (request/response) para que el agente de frontend pueda integrarlo sin ambigüedad.

## Coordinación con el frontend
Antes de que el frontend empiece a integrar, acordá con el agente de frontend la forma exacta de los JSON de comparsa, categoría y voto, y confirmá los nombres de campos para evitar descalces.