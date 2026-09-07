# AGENTS.md

## Project: Carnavales

Este proyecto implementa un sistema de autenticación y autorización
seguro para una aplicación web.

El objetivo principal es proporcionar autenticación robusta, sesiones
seguras, verificación de identidad (2FA) y una base arquitectónica
preparada para autorización basada en roles.

---

# 1. Stack tecnológico

## Frontend

- React 18
- Vite 8
- JavaScript (ESM)
- React Router v7
- better-auth/react (cliente)
- CSS

## Backend

- Node.js (ESM modules, `"type": "module"`)
- Express 4.21
- JavaScript (ESM)
- Better Auth 1.6.x
- express-rate-limit
- Helmet
- CORS
- REST API

## Database

- PostgreSQL 14+
- pg Pool (sin ORM)
- Better Auth gestiona sus propias tablas
- Tablas de negocio `comparsas`, `rubros`, `calificacion` y `jurado_rubros` (gestionadas por `npm run migrate-tables`)

## Modelo de datos de votación

```
user (text PK: id) 1:N account (text PK: id) 1:N calificacion N:1 rubros N:1 comparsas
user (text PK: id) 1:N jurado_rubros N:1 rubros (asignación de rubros por jurado)
```

- `comparsas` 1:N `rubros` (cada rubro pertenece a una comparsa vía `rubros.comparsa_id`)
- `rubros` 1:N `calificacion` (cada calificación pertenece a un rubro vía `calificacion.rubro_id`)
- `account` 1:N `calificacion` (cada calificación registra el jurado vía `calificacion.account_id`)
- `user` 1:N `jurado_rubros` (asignaciones de rubros/comparsas por jurado; cada fila une
  `user_id`, `comparsa_id` y `rubro_id`, con `UNIQUE (user_id, rubro_id)` y FKs ON DELETE CASCADE)
- `calificacion.puntaje` con CHECK (1..10) y UNIQUE (account_id, rubro_id, noche)

## Authentication

- Better Auth (fuente principal de verdad)
- Session-based authentication (cookies HttpOnly)
- Email/password
- 2FA/OTP via plugin twoFactor
- Sesiones server-side
- El alta de 2FA permanece pendiente hasta verificar un OTP; la verificación rota la sesión
- Flag `isAdmin` en `additionalFields` del usuario (acceso simple al panel `/admin`)

En desarrollo, el adaptador `console` imprime el código OTP. En producción,
la aplicación exige el adaptador `smtp`, nunca registra el código y almacena
el OTP cifrado mediante Better Auth.

El OTP se entrega mediante `email.service.js` usando plantillas HTML profesionales
de `email-templates.js`. El adaptador de consola solo se permite fuera de
producción; en producción se exige SMTP (Gmail u otro). Los OTP se almacenan
cifrados y nunca deben aparecer en logs de producción.

---

# 2. Principios obligatorios

Todas las decisiones técnicas deben seguir:

1. Security by Design
2. Defense in Depth
3. Principle of Least Privilege
4. Secure Defaults
5. Fail Securely
6. Explicit validation
7. Separation of concerns
8. Auditability
9. Minimal exposure of sensitive information
10. No secrets committed to Git

La seguridad tiene prioridad sobre la comodidad de implementación.

---

# 3. Reglas críticas

## Secrets

Nunca:

- hardcodear contraseñas
- hardcodear API keys
- hardcodear secrets de Better Auth
- hardcodear database credentials
- subir `.env`
- imprimir secrets en logs

Utilizar:

- `.env`
- `.env.example`
- secret managers en producción

## Backend prohibiciones

- `eval()`, `Function()`, `new Function()`
- SQL construido mediante concatenación
- `console.log` de passwords, tokens o datos sensibles en producción
- Exponer stack traces al cliente en producción
- Confiar en datos del frontend para autorización
- Deshabilitar Helmet en producción
- CORS `origin: "*"` con credentials

## Frontend prohibiciones

- `localStorage` para tokens/credenciales
- `sessionStorage` para datos sensibles
- `dangerouslySetInnerHTML` con input del usuario
- Hardcodear URLs de API de producción; solo se permite el fallback local de desarrollo
- Confiar en guards de React como seguridad real

---

# 4. Authentication

La autenticación debe utilizar Better Auth como componente principal.

## Login con Email + DNI + PIN (flujo actual de la UI)

- El login de la aplicación pide **email + DNI** y envía un **PIN de 6 dígitos** por correo.
- Se usa el plugin `emailOTP` de Better Auth con `disableSignUp: true` y
  `storeOTP: "encrypted"` (el OTP se guarda cifrado).
- El campo `dni` es un `additionalFields` del usuario, **solo para pruebas**
  (no hay backfill, carga ni administración funcional de DNI).
- El envío del PIN se controla desde `POST /api/login-pin/request` (`api/src/routes/login-pin.routes.js`):
  valida que el usuario exista y que su `dni` coincida (respuesta genérica e
  idéntica si no existen o no coinciden, sin enumeración) y recién entonces
  emite el OTP de forma server-side vía `auth.api.sendVerificationOTP`.
- **Alta de jurados por el admin** (`POST /api/admin/jurados`): se inserta el usuario en la
  tabla `user` de Better Auth (`emailVerified=false`, `dni`, `isAdmin=false`) y, en la misma
  operación, se emite un PIN inicial vía `auth.api.createVerificationOTP` y se envía un correo
  de bienvenida con el PIN (`juradoBienvenidaEmail`). El jurado luego hace login con
  email + DNI + el PIN solicitado en `/api/login-pin/request`; Better Auth lo marca verificado
  en el primer sign-in exitoso (`sign-in/email-otp`).
- Los endpoints HTTP del plugin `email-otp` (`/api/auth/email-otp/*`, etc.)
  están **bloqueados** con 404 en `server.js` para impedir enviar/verificar OTP
  por fuera del flujo controlado; solo se expone `/api/auth/sign-in/email-otp`
  para que el cliente verifique el PIN y reciba la cookie de sesión.
- El email+password de Better Auth se mantiene en backend únicamente para
  compatibilidad con los tests existentes; **no se usa en la UI**.

No implementar manualmente:

- generación de sesiones
- hashing de passwords
- tokens de recuperación
- tokens de verificación
- rotación de sesiones
- almacenamiento, verificación o cifrado propio de OTP

si Better Auth ya proporciona una implementación segura para ello.

La contraseña nunca debe almacenarse en texto plano.

Better Auth gestiona el hashing seguro de passwords; no debe implementarse manualmente.

---

# 5. Sessions

Sesiones server-side gestionadas por Better Auth.

Las cookies de autenticación deben utilizar:

- HttpOnly (default de Better Auth)
- Secure en producción
- SameSite lax (default)
- expiración razonable
- rotación/invalidez cuando corresponda

Nunca almacenar tokens de autenticación sensibles en:

- localStorage
- sessionStorage
- cookies accesibles mediante JavaScript

---

# 6. Backend Architecture

```
api/
├── src/
│   ├── auth/
│   │   └── auth.js            # Configuración Better Auth, 2FA y recuperación
│   ├── middleware/
│   │   └── auth.middleware.js  # requireAuth y requireTwoFactor
│   ├── routes/
│   │   ├── protected.routes.js # Rutas /api/me, /api/enable-2fa, /api/health
│   │   ├── login-pin.routes.js # POST /api/login-pin/request
│   │   ├── admin.routes.js     # CRUD /api/admin/comparsas y /api/admin/rubros
│   │   ├── admin-users.routes.js # Gestión de jurados /api/admin/jurados*
│   │   └── jurado.routes.js      # Asignaciones del jurado /api/jurado/mis-*
│   ├── services/
│   │   ├── email.service.js    # Adaptadores console y SMTP seguros
│   │   └── email-templates.js  # Plantillas HTML profesionales (OTP, Reset, Bienvenida jurado)
│   └── server.js               # Express + Better Auth
├── scripts/
│   ├── migrate-tables.js       # Crea/llena comparsas, rubros, calificacion y jurado_rubros
│   └── promote-admin.js        # Habilita isAdmin a un usuario por email
├── .env
├── .env.example
└── package.json
```

El backend debe mantener separación entre:

- routes → definen endpoints, delegan a controllers
- controllers → lógica HTTP, validación, respuestas
- services → lógica de negocio (email.service.js, email-templates.js)
- middleware → cross-cutting concerns (auth, logging)

---

# 7. Frontend Architecture

```
client/
├── src/
│   ├── lib/
│   │   ├── auth-client.js     # Cliente Better Auth
│   │   ├── api.js             # apiFetch compartido (fetch + credentials)
│   │   └── voting-storage.js  # Persistencia de la sesión de votación (sessionStorage)
│   ├── components/
│   │   ├── AuthLink.jsx         # Enlaces que conservan el fondo del modal
│   │   ├── Modal.jsx             # Modal accesible controlado por rutas
│   │   ├── ProtectedRoute.jsx    # Guard de rutas (solo UX)
│   │   └── JuradoManager.jsx     # Gestión de jurados y asignaciones en el panel admin
│   ├── pages/
│   │   ├── Landing.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── VerifyCode.jsx
│   │   ├── ForgotPassword.jsx
│   │   ├── ResetPassword.jsx
│   │   ├── Home.jsx
│   │   ├── Admin.jsx
│   │   ├── VotingScreen.jsx
│   │   └── ConfirmScreen.jsx
│   ├── router/
│   │   └── Router.jsx
│   ├── App.jsx
│   └── main.jsx
├── .env
└── package.json
```

El frontend es UX, no seguridad. El backend SIEMPRE verifica.

Las rutas públicas de autenticación (`/login`, `/register`, `/verify-code`,
`/forgot-password` y `/reset-password`) se renderizan como modales controlados
por React Router sobre la pantalla base `/`. El acceso directo a una ruta sigue
siendo válido y muestra el modal a pantalla completa.

---

# 8. Database

- PostgreSQL 14+
- pg Pool (sin ORM)
- Better Auth crea/modifica sus tablas mediante `npm run migrate` en `api`
- Tablas de negocio `comparsas`, `rubros`, `calificacion` y `jurado_rubros`
  mediante `npm run migrate-tables` en `api`
- Parameterized queries (`$1, $2...`) siempre
- Constraints, foreign keys, índices para integridad
- No almacenar passwords en texto plano
- Better Auth gestiona los OTP; configurar `storeOTP: "encrypted"` y no
  implementar almacenamiento o verificación manual

---

# 9. API Design

## Endpoints Better Auth (automáticos)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | /api/auth/sign-up/email | Registro |
| POST | /api/auth/sign-in/email | Login |
| POST | /api/auth/sign-out | Logout |
| GET | /api/auth/get-session | Obtener sesión |
| POST | /api/auth/two-factor/send-otp | Enviar OTP |
| POST | /api/auth/two-factor/verify-otp | Verificar OTP |
| POST | /api/auth/request-password-reset | Solicitar recuperación |
| POST | /api/auth/reset-password | Restablecer contraseña |

## Endpoints personalizados

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | /api/me | ✓ | Info del usuario (incluye `isAdmin`) |
| POST | /api/enable-2fa | ✓ | Habilitar 2FA |
| POST | /api/login-pin/request | ✗ | Enviar PIN de acceso (email+DNI) |
| GET | /api/health | ✗ | Health check |

## Endpoints de administración (requieren `isAdmin`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/admin/comparsas | Listar comparsas (solo autenticado) |
| POST | /api/admin/comparsas | Crear comparsa |
| PUT | /api/admin/comparsas/:id | Editar comparsa |
| DELETE | /api/admin/comparsas/:id | Eliminar comparsa |
| GET | /api/admin/rubros | Listar rubros (solo autenticado) |
| POST | /api/admin/rubros | Crear rubro |
| PUT | /api/admin/rubros/:id | Editar rubro |
| DELETE | /api/admin/rubros/:id | Eliminar rubro |

## Endpoints de jurados

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| GET | /api/admin/jurados | ✓ + admin | Listar jurados (incluye DNI y asignaciones) |
| POST | /api/admin/jurados | ✓ + admin | Crear jurado (email+DNI) y enviar PIN de bienvenida |
| PUT | /api/admin/jurados/:userId | ✓ + admin | Editar jurado y sus asignaciones |
| DELETE | /api/admin/jurados/:userId | ✓ + admin | Eliminar un jurado (nunca un admin) |
| DELETE | /api/admin/jurados | ✓ + admin | Eliminar todos los jurados (usuarios `isAdmin=false`); los admins nunca se borran |
| GET | /api/jurado/mis-rubros | ✓ | Rubros (id, nombre, rango, comparsa) asignados al jurado logueado |
| GET | /api/jurado/mis-comparsas | ✓ | Comparsas para las que el jurado tiene al menos un rubro asignado |

El `dni` es un campo PII: el listado `GET /api/admin/jurados` exige `requireAdmin`
(fail-secure), y los logs del backend nunca imprimen el DNI ni `req.body` completo.

La lectura (GET) de comparsas/rubros requiere `requireAuth`; las mutaciones (POST/PUT/DELETE)
requieren además `requireAdmin` (fail-secure: 401 sin sesión, 403 sin `isAdmin`).

## Rate limiting

- 10 requests/15min en login y registro
- 5 requests/15min en recuperación de contraseña
- 5 requests/15min en `/api/login-pin/request`
- Rate limiting por IP

---

# 10. Security

## Headers de seguridad

- Helmet habilitado en todas las rutas
- CORS restringido a `FRONTEND_URL`

## Autenticación

- Better Auth para toda operación de auth
- Mensajes de error genéricos (sin user enumeration)
- Rate limiting en endpoints de auth
- 2FA/OTP con expiración y límite de intentos

## Autorización

- `requireAuth` protege los endpoints personalizados actuales
- El login por PIN (email+DNI) restaura directamente como segundo factor autenticado,
  por lo que `/api/me` depende solo de `requireAuth`
- `requireTwoFactor` se conserva para el flujo legacy de onboarding 2FA
- El flag `isAdmin` habilita el acceso simple al panel `/admin` y a los
  endpoints mutables de `/api/admin/*`
- RBAC, permisos granulares y ownership todavía no están implementados
- Frontend solo UX, no seguridad

## Input

- Validar body, params, query
- Parameterized queries (pg)
- No mass assignment

## Errores

- Mensajes genéricos en producción
- Stack traces no expuestos al cliente
- Logging interno de errores

---

# 11. Environment Variables

## Backend (.env)

| Variable | Descripción |
|----------|-------------|
| DATABASE_URL | Conexión PostgreSQL |
| BETTER_AUTH_SECRET | Secreto Better Auth (mín. 32 chars) |
| BETTER_AUTH_URL | URL del backend |
| FRONTEND_URL | URL del frontend (CORS) |
| SMTP_HOST | Servidor SMTP |
| SMTP_PORT | Puerto SMTP |
| SMTP_USER | Usuario SMTP |
| SMTP_PASSWORD | Contraseña SMTP (App Password de Gmail en producción) |
| EMAIL_PROVIDER | `console` en desarrollo o `smtp` en producción |
| EMAIL_FROM | Email remitente |
| PASSWORD_RESET_TOKEN_TTL | TTL del token de recuperación |
| MAIL_FROM | Email remitente |
| NODE_ENV | development/production |
| PORT | Puerto del servidor |

## Frontend (.env)

| Variable | Descripción |
|----------|-------------|
| VITE_API_URL | URL del backend |

---

# 12. Skills

Las Skills de seguridad están en `.agents/skills/`:

| Skill | Responsabilidad |
|-------|-----------------|
| backend-security | Node.js, Express, Helmet, CORS, rate limiting |
| authentication | Login, logout, sesiones, brute force |
| authorization | RBAC, roles, permisos, IDOR |
| better-auth-integration | Configuración Better Auth, Express, React |
| api-security | Validación, SQL injection, XSS, CSRF |
| database-security | PostgreSQL, parameterized queries |
| frontend-security | ProtectedRoute, XSS, localStorage |
| security-testing | Tests de auth, authz, vulnerabilidades |
| security-code-review | Auditoría de código, clasificación |

Usar estas Skills al desarrollar, modificar o revisar código.

---

# 13. Testing

## Tests pendientes

- [x] Login correcto/incorrecto
- [x] User enumeration
- [x] Rutas protegidas con sesión
- [x] Rutas de negocio bloqueadas hasta habilitar 2FA
- [x] Rate limiting
- [x] Input inválido
- [x] SQL injection
- [ ] IDOR
- [ ] Sesiones expiradas por timeout
- [x] Logout
- [x] 2FA/OTP backend: habilitación, envío, verificación y sesión final
- [x] Login PIN (email+DNI): envío, verificación, sesión y bloqueo HTTP del plugin `email-otp`
- [x] Admin: autorización de `/api/admin/*` (401 sin sesión, 403 sin `isAdmin`)
- [x] Jurados: CRUD `/api/admin/jurados`, PIN de bienvenida, asignaciones, DNI/email duplicados, borrado masivo conservando admins

## Framework

- Node.js test runner
- Tests en `api/src/tests/`
- Pruebas de backend y pruebas unitarias de utilidades frontend

---

# 14. Deployment

## Pre-requisitos

- Node.js 20.19+ (o 22.12+)
- PostgreSQL 14+
- SMTP server (producción)

## Comandos

```bash
# Backend
cd api
npm install
npm run migrate          # tablas de Better Auth (agrega isAdmin en "user")
npm run migrate-tables   # tablas de negocio comparsas, rubros, calificacion y jurado_rubros
npm run dev

# Frontend
cd client
npm install
npm run dev
```

## Producción

- `BETTER_AUTH_SECRET` con valor fuerte
- `NODE_ENV=production`
- HTTPS habilitado
- SMTP real configurado (Gmail con App Password u otro proveedor)
- Helmet habilitado
- CORS restringido
- Adaptador de correo distinto de `console`
