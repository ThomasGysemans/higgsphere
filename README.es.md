# higgsphere

[English](README.md) · [Français](README.fr.md) · **Español**

Una galería local para todas las imágenes y vídeos que generas con IA: lo más reciente
primero, cada uno junto al prompt exacto, el modelo y el coste que lo produjeron. El
repositorio incluye skills de Claude para optimizar el proceso de generación.

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
[CLAUDE.md](CLAUDE.md), que Claude Code lee automáticamente, así que escribe estos archivos
correctamente sin que haga falta pedírselo.

### El historial de gastos

`generations/.higgsphere-ledger.jsonl` registra todo lo que has pagado. Una generación se
anota en cuanto aparece en la carpeta, y la entrada se conserva después de borrar el
archivo, tanto si lo borras desde la aplicación como con `rm`. Borrar un medio quita una
tesela del muro, pero no reduce el total gastado. La página **Gastos** (`/stats`) lee este
historial para mostrar el gasto a lo largo del tiempo, por proveedor y por modelo.

El historial solo admite añadidos y se versiona en git. Es el único archivo de la carpeta
que no puede reconstruirse a partir de los demás.

### Monedas

Los costes se guardan en la moneda que facturó el proveedor. La cabecera permite mostrar
todos los importes en euros, dólares estadounidenses o libras esterlinas, convertidos
con tipos de cambio fijos.

## Idiomas

La interfaz está disponible en inglés, francés y español; el idioma se elige en la
cabecera. Solo se traduce la interfaz: los prompts, las notas, las etiquetas y todo lo
que viene de un sidecar se muestran tal como se escribieron.

## Skills

Las skills de Claude Code de [.claude/skills/](.claude/skills/) se encargan de la
generación por ti:

- [`kie-ai`](.claude/skills/kie-ai/SKILL.md) convierte una descripción en un prompt
  detallado, genera imágenes o vídeos con Kie AI (Kling, Veo, Seedream, Nano Banana…) y
  guarda el resultado y su archivo `.json` en `generations/`. Primero estima el coste y no
  gasta nada hasta que respondes `kie ok <créditos>`. Un hook lo garantiza.
- [`video-loop`](.claude/skills/video-loop/SKILL.md) convierte un vídeo generado en un
  bucle sin cortes. Se ejecuta en local con `ffmpeg`, así que no cuesta nada.

## Usar otro LLM

El muro no depende de Claude: todo lo que escriba un medio y su `.json` en `generations/`
aparece en él. Solo la configuración del agente es propia de Claude Code:

- **Instrucciones:** la mayoría de los demás agentes leen `AGENTS.md` en lugar de
  `CLAUDE.md`. Crea un enlace con `ln -s CLAUDE.md AGENTS.md`, o indica `CLAUDE.md` a tu
  herramienta.
- **Skills:** cada una es un archivo Markdown con scripts de shell. Cualquier agente capaz
  de ejecutar comandos puede seguirlas: pídele que lea el `SKILL.md`, o copia la carpeta
  donde tu herramienta busca sus skills.
- **Control de costes:** `kie ok <créditos>` depende de los hooks de Claude Code. Sin
  ellos, `kie-ai` rechaza toda generación de pago. Adapta
  [kie-guard.py](.claude/hooks/kie-guard.py) a los hooks de tu herramienta para
  desbloquearlo.

## Contribuir

- **Añadir un proveedor:** escribe una skill en `.claude/skills/` que termine guardando el
  medio y su sidecar en `generations/`. El muro no necesita ningún cambio.
- **Cambiar la interfaz:** es SvelteKit con las runes de Svelte 5. [CLAUDE.md](CLAUDE.md)
  indica el papel de cada archivo.
- **Mantenerlo local:** ninguna dependencia de runtime aparte de SvelteKit, y ninguna
  llamada de red saliente. Los tipos de cambio están fijados en
  [src/lib/currency.ts](src/lib/currency.ts): actualízalos de vez en cuando.
- Ejecuta `npm run check` antes de abrir una PR.
