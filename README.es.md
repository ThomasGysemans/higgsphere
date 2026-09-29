# higgsphere

[English](README.md) · [Français](README.fr.md) · **Español**

Una galería local para todas las imágenes y vídeos que generas con IA: lo más reciente
primero, cada uno junto al prompt exacto, el modelo y el coste que lo produjeron. El
repositorio incluye skills de Claude para optimizar el proceso de generación.

![El muro: todas las generaciones en una cuadrícula masonry, lo más reciente primero](screenshots/wall.jpg)

## Por qué

Los medios generados con IA acaban repartidos entre los paneles de los proveedores, las
carpetas de descargas y los historiales de chat, y el prompt que hay detrás de un
resultado casi siempre se pierde. higgsphere lo guarda todo en una sola carpeta y lo
muestra como un muro de tipo mampostería que se puede buscar y filtrar.

También está pensado para que lo maneje un LLM. En lugar de escribir los prompts a mano,
describes lo que quieres a Claude Code (u otro servicio similar). Este redacta un prompt
detallado, llama al modelo y guarda el resultado junto con sus metadatos. Como cada prompt
queda al lado de su resultado, puedes comparar resultados, quedarte con las formulaciones
que funcionan y pedirle al LLM que mejore el siguiente intento a partir de lo que ya
tienes.

## Instalación

Requiere Node.js 20.19+ (Vite 8).

```sh
npm install
npm run dev        # http://localhost:5173
```

Para generar medios desde Claude Code, copia `.env.example` a `.env` y añade tu clave de
[Kie AI](https://kie.ai).

## Cómo funciona

### La carpeta de resultados

La carpeta `generations/` es la única fuente de datos del muro. Cada imagen o vídeo se
guarda allí, junto a un archivo `.json` con el mismo nombre que registra cómo se hizo:

```
generations/
  2026-08-31-nebula-drift.png
  2026-08-31-nebula-drift.json
```

```json
{
  "prompt": "A vast nebula drifting through deep space, volumetric dust lanes lit from within",
  "model": "imagen-4-ultra",
  "service": "Google Vertex AI",
  "cost": 0.06,
  "created_at": "2026-08-31T10:31:00Z"
}
```

> Los archivos JSON pueden incluir metadatos personalizados, que el LLM se encargará de
> rellenar.

Los archivos nuevos aparecen en el muro en menos de un segundo, sin recargar ni reiniciar.
Todos los campos son opcionales y se admiten subcarpetas. El esquema completo está en
[AGENTS.md](AGENTS.md), que los agentes de código leen automáticamente, así que escriben
estos archivos correctamente sin que haga falta pedírselo.

![Una generación abierta en el visor, junto a su prompt, su coste y sus metadatos](screenshots/lightbox.jpg)

### El historial de gastos

`generations/.higgsphere-ledger.jsonl` registra todo lo que has pagado. Una generación se
anota en cuanto aparece en la carpeta, y la entrada se conserva después de borrar el
archivo, tanto si lo borras desde la aplicación como con `rm`. Borrar un medio quita una
tesela del muro, pero no reduce el total gastado. La página **Gastos** (`/stats`) lee este
historial para mostrar el gasto a lo largo del tiempo, por proveedor y por modelo.

El historial solo admite añadidos y se versiona en git. Es el único archivo de la carpeta
que no puede reconstruirse a partir de los demás.

![La página Gastos: totales, cronología, proveedores y registro](screenshots/spend.png)

### Monedas

Los costes se guardan en la moneda que facturó el proveedor. La cabecera permite mostrar
todos los importes en euros, dólares estadounidenses o libras esterlinas, convertidos
con tipos de cambio fijos.

## Idiomas

La interfaz está disponible en inglés, francés y español; el idioma se elige en la
cabecera. Solo se traduce la interfaz: los prompts, las notas, las etiquetas y todo lo
que viene de un sidecar se muestran tal como se escribieron.

## Skills

Las skills de [.agents/skills/](.agents/skills/) se encargan de la generación por ti:

- [`kie-ai`](.agents/skills/kie-ai/SKILL.md) convierte una descripción en un prompt
  detallado, genera imágenes o vídeos con Kie AI (Kling, Veo, Seedream, Nano Banana…) y
  guarda el resultado y su archivo `.json` en `generations/`. Primero estima el coste y no
  gasta nada hasta que fijas un presupuesto respondiendo `kie ok <créditos>`.
- [`video-loop`](.agents/skills/video-loop/SKILL.md) convierte un vídeo generado en un
  bucle sin cortes. Se ejecuta en local con `ffmpeg`, así que no cuesta nada.

## Usar otro LLM

El muro no depende de Claude: todo lo que escriba un medio y su `.json` en `generations/`
aparece en él. La configuración del agente funciona tal cual con la mayoría de los agentes
de código:

- **Las instrucciones** están en [AGENTS.md](AGENTS.md), que Codex, Cursor, Copilot y
  otros leen directamente. `CLAUDE.md` lo importa, y `.gemini/settings.json` remite a él a
  Gemini CLI.
- **Las skills** están en `.agents/skills/`, y `.claude/skills/` enlaza a esa carpeta
  para Claude Code. `AGENTS.md` las enumera: un agente que no carga las skills por sí solo
  sabe igualmente cuándo leerlas.
- **El presupuesto:** `kie-ai` prohíbe toda generación de pago hasta que fijas un
  presupuesto con `kie ok <créditos>`. Es una regla escrita que el agente sigue, no un
  bloqueo técnico.

## Contribuir

- **Añadir un proveedor:** escribe una skill en `.agents/skills/` que termine guardando el
  medio y su sidecar en `generations/`. El muro no necesita ningún cambio.
- **Cambiar la interfaz:** es SvelteKit con las runes de Svelte 5. [AGENTS.md](AGENTS.md)
  indica el papel de cada archivo.
- **Mantenerlo local:** ninguna dependencia de runtime aparte de SvelteKit, y ninguna
  llamada de red saliente. Los tipos de cambio están fijados en
  [src/lib/currency.ts](src/lib/currency.ts): actualízalos de vez en cuando.
- Ejecuta `npm run check` antes de abrir una PR.
