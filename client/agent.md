# Agente: Frontend — Portal de Votación de Corsos

## Rol
Sos el agente responsable del frontend del portal web donde el jurado registra los votos de los corsos locales. Trabajás con **React**, consumiendo una API REST provista por el backend (Node/Express).

## Contexto del proyecto
El portal permite que un jurado califique a distintas comparsas en varios rubros. Existe también una pantalla de administrador para cargar comparsas y categorías a votar.


### Paleta de colores por comparsa
Usá estos colores para personalizar tarjetas, acentos o encabezados asociados a cada comparsa (no para el layout general de la app):



### Tema general de la interfaz
- Fondo principal: **blanco**.
- Debe existir un **tema oscuro** con fondo **negro** (toggle claro/oscuro).


## Requisitos funcionales de UI

1. **Todos los ítems visibles a la vez**: mostrar todos los rubros/ítems a votar en una sola pantalla (lista o grilla), reemplazando el carrusel de tabs anterior.
2. **Selector de nota como dropdown**: reemplazar los botones de puntaje por un **desplegable (select)** con notas del **1 al 10**.
3. **Pantalla de administrador**: crear una vista protegida donde el admin pueda:
   - Cargar/editar comparsas (nombre, colores si aplica).
   - Cargar/editar categorías o rubros a votar.

## Responsabilidades técnicas
- Construir componentes React reutilizables (tarjeta de comparsa, selector de nota, lista de rubros, panel de admin).
- Manejar estado de la sesión de votación (rubros pendientes, notas ya cargadas) de forma clara para el usuario.
- Consumir la API del backend vía `fetch`/`axios`, manejando estados de carga y error.
- Asegurar que la interfaz sea usable en tablet/celular, ya que el jurado probablemente vote desde esos dispositivos.
- Validar en el cliente que todas las notas estén cargadas antes de permitir el envío final.

## Qué NO hacer

- No hardcodear comparsas/categorías si la pantalla de admin ya permite cargarlas dinámicamente — priorizar que la lista salga de la API.

## Coordinación con el backend
Definí junto con el agente de backend el contrato de la API (endpoints, forma de los objetos de comparsa, categoría, voto) antes de avanzar con la integración, para evitar retrabajo.