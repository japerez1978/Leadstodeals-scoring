# LeadsToDeals Scoring

SaaS multi-tenant de scoring de oportunidades comerciales para PYMEs industriales. Se integra con HubSpot como CRM y puntúa automáticamente cada deal en base a matrices de criterios configurables por tenant.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Base de datos | Supabase (PostgreSQL + RLS + pgvector) |
| Autenticación | Supabase Auth |
| CRM | HubSpot via proxy Railway |
| Deploy | Vercel |

---

## Arquitectura multi-tenant

Cada tenant tiene sus propias matrices, criterios y umbrales. El acceso a los datos está controlado mediante Row Level Security (RLS) en Supabase — cada usuario autenticado solo puede leer y escribir datos de su propio tenant.

```
tenants (id INTEGER, name, ...)
  └── tenant_users (tenant_id → tenants.id, auth_user_id → auth.users.id)
  └── scoring_matrices (tenant_id)
        └── criteria (matrix_id)
              └── criterion_options (criterion_id)
        └── score_thresholds (matrix_id)
  └── deal_scores (tenant_id, hubspot_deal_id, score, ...)
```

**Tenant actual:** Intranox (`id: 1`)

---

## Schema de base de datos

### `tenants`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| name | TEXT | Nombre del tenant |

### `tenant_users`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | PK |
| tenant_id | INTEGER | FK → tenants |
| auth_user_id | UUID | FK → auth.users |

### `scoring_matrices`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| tenant_id | INTEGER | FK → tenants |
| name | TEXT | Nombre de la matriz |
| active | BOOLEAN | Solo una activa por tenant |

### `criteria`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| matrix_id | INTEGER | FK → scoring_matrices |
| name | TEXT | Nombre del criterio |
| hubspot_property | TEXT | Propiedad HubSpot que se evalúa |
| weight | NUMERIC | Peso del criterio en la fórmula |

### `criterion_options`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| criterion_id | INTEGER | FK → criteria |
| label | TEXT | Etiqueta visible |
| hubspot_value | TEXT | Valor exacto en HubSpot |
| multiplier | NUMERIC | Multiplicador: +1, +0.5, 0, -0.5, -1 |

### `score_thresholds`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| matrix_id | INTEGER | FK → scoring_matrices |
| label | TEXT | Alto / Medio / Bajo |
| min_score | INTEGER | Límite inferior |
| max_score | INTEGER | Límite superior |
| color | TEXT | Color del semáforo |

### `deal_scores`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| tenant_id | INTEGER | FK → tenants |
| hubspot_deal_id | TEXT | ID del deal en HubSpot |
| score | INTEGER | Puntuación calculada |
| matrix_id | INTEGER | Matriz usada |
| calculated_at | TIMESTAMP | Fecha del cálculo |

---

## Motor de scoring

### Fórmula

```
Score = ((Σ(peso × multiplicador) + totalPesos) / (totalPesos × 2)) × 100
```

- Se itera sobre todos los criterios de la matriz activa
- Para cada criterio se busca el valor del deal en HubSpot y se localiza la opción correspondiente
- Si no hay valor para un criterio, no suma pero sí cuenta en `totalPesos`

### Multiplicadores

| Nivel | Multiplicador |
|-------|--------------|
| Muy alta | +1 |
| Alta | +0.5 |
| Media | 0 |
| Baja | -0.5 |
| Muy baja | -1 |

### Semáforo

| Score | Nivel |
|-------|-------|
| ≥ 70 | Alto (verde) |
| ≥ 45 | Medio (amarillo) |
| < 45 | Bajo (rojo) |

---

## Matrices configuradas (Intranox)

### Obra/Proyecto RCM — 6 criterios
Evalúa oportunidades de obra industrial por relevancia, complejidad y madurez.

### Scoring Intranox — 5 criterios
Matriz general de priorización de deals para el equipo comercial.

---

## Proxy HubSpot

Las llamadas a la API de HubSpot se realizan a través de un proxy desplegado en Railway para evitar exponer el API key en el frontend.

**URL:** `https://intranox-proxy-production.up.railway.app`

El proxy expone el endpoint:
```
GET /proxy/crm/v3/objects/deals?limit=100&properties=...
```

---

## Variables de entorno

```env
VITE_SUPABASE_URL=        # URL del proyecto Supabase
VITE_SUPABASE_ANON_KEY=   # Anon key pública de Supabase
VITE_PROXY_URL=           # URL base del proxy HubSpot
```

En Vercel: Settings → Environment Variables.

---

## Roadmap

- [ ] Mejorar UI/diseño del dashboard
- [ ] Panel configurador de matrices (ScoringPage)
- [ ] Guardar scores calculados en `deal_scores` de Supabase
- [ ] Escribir score de vuelta en propiedad personalizada de HubSpot
- [ ] CRM Card nativa dentro de HubSpot
- [ ] Agente IA con fuentes externas (Einforma, prensa sectorial, INE)
