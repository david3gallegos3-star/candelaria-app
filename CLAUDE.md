# Candelaria App — Instrucciones para Claude

## Proyecto
Aplicación de gestión para fábrica de embutidos Candelaria (Ibarra, Ecuador).
Stack: React + Supabase (PostgREST). Categorías: CORTES, AHUMADOS-HORNEADOS, INMERSIÓN.

## Reglas siempre activas

### Pensamiento secuencial
Ante cualquier tarea que involucre múltiples pasos, análisis de causa-raíz, o decisiones de arquitectura, usa la herramienta `sequential-thinking` para razonar antes de responder.

### Context7
Antes de escribir código que use una librería externa (React, Supabase, cualquier npm package), consulta Context7 con `resolve-library-id` y `get-library-docs` para verificar la API actualizada.

### Skills de Superpowers — activar automáticamente

| Situación | Skill a usar |
|-----------|-------------|
| Antes de codear cualquier feature | `brainstorming` |
| Ante cualquier bug o comportamiento inesperado | `systematic-debugging` |
| Al terminar cualquier tarea | `verification-before-completion` |
| Al crear un plan de implementación | `writing-plans` |
| Al ejecutar un plan con tareas independientes | `subagent-driven-development` |
| Al terminar una rama de desarrollo | `finishing-a-development-branch` |

**No esperar a que David los pida — activarlos proactivamente según la situación.**

### Calidad de código
- Sin comentarios innecesarios
- Sin abstracciones prematuras
- Sin manejo de errores para escenarios imposibles
- Respuestas cortas y directas
