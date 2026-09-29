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

## Idiomas

La interfaz está disponible en **inglés, francés y español**. En la cabecera de cada página
hay un selector de idioma.

- **Qué se traduce:** la propia interfaz (etiquetas, botones, estados vacíos, mensajes de
  error), además del formato de fechas, números y porcentajes. Los importes se muestran
  siempre en euros, sea cual sea el idioma.
- **Qué no se traduce nunca:** todo lo que viene de un sidecar. Prompts, notas, etiquetas,
  nombres de modelos y proveedores, nombres de archivo y metadatos personalizados se
  muestran tal como se escribieron.
- **Qué idioma se usa:** el último elegido en la cabecera (guardado en el `localStorage`
  del navegador); si no hay ninguno, el primer idioma del navegador que la aplicación
  admita; si no, el inglés. El idioma se decide antes del primer renderizado, así que la
  página nunca aparece un instante en el idioma equivocado.
- **Los mensajes del servidor** (avisos de lectura, errores de bajo nivel) son
  diagnósticos para desarrolladores y se quedan en inglés. Los errores que un usuario
  puede encontrarse de verdad, como un borrado fallido, llevan un `code` que el cliente
  traduce.

Las traducciones están en [src/lib/i18n/](src/lib/i18n/). No hay ninguna librería de
i18n: cada idioma es un simple objeto TypeScript.

```
src/lib/i18n/
  en.ts             ← diccionario de referencia; su tipo es el contrato (Messages)
  fr.ts, es.ts      ← tipados como Messages
  index.svelte.ts   ← lista LOCALES + el store reactivo `i18n`
  plural.ts         ← ayuda para plurales, basada en Intl.PluralRules
```

Los componentes leen sus textos en `i18n.m`, por ejemplo `i18n.m.bar.filters`. `m` se
deriva del idioma actual, así que al cambiar de idioma todo se vuelve a renderizar sin
recargar.

### Añadir un texto

1. Añádelo a [`en.ts`](src/lib/i18n/en.ts). Este archivo define el tipo `Messages`.
2. Añádelo a todos los demás diccionarios. Mientras no lo hagas, `npm run check` falla e
   indica la clave que falta.
3. Léelo en un componente a través de `i18n.m`.

Unas pocas convenciones mantienen las traducciones seguras y comprobadas por el
compilador:

- **Todo texto que depende de un valor es una función**, como
  `since: (date: string) => ...`. Así el compilador comprueba los parámetros en todos los
  idiomas.
- **Los plurales usan `plural()`**, definido en [`plural.ts`](src/lib/i18n/plural.ts),
  nunca `n > 1`. Los idiomas no coinciden: el francés trata el 0 como singular, el inglés
  y el español como plural.
- **El código en línea va entre acentos graves**, por ejemplo
  ``'Deja tus archivos en `generations/`'``. El componente `Rich` convierte esos
  fragmentos en `<code>`. Nunca pongas HTML en una traducción.

### Añadir un idioma

1. Copia `src/lib/i18n/en.ts` a `src/lib/i18n/<código>.ts`, tipa la exportación como
   `Messages` y traduce los valores.
2. Regístralo en `LOCALES`, en [`index.svelte.ts`](src/lib/i18n/index.svelte.ts), con su
   nombre escrito en ese idioma (`Deutsch`, no `Alemán`).
3. Ejecuta `npm run check`. Una clave que falta, una clave de más o un parámetro con el
   tipo equivocado hacen fallar la comprobación.
4. Traduce también este README, como `README.<código>.md`, y añádelo a los enlaces del
   principio de cada README.

## Skills

Las skills de Claude Code de [.claude/skills/](.claude/skills/) se encargan de la
generación por ti:

- [`kie-ai`](.claude/skills/kie-ai/SKILL.md) convierte una descripción en un prompt
  detallado, genera imágenes o vídeos con Kie AI (Kling, Veo, Seedream, Nano Banana…) y
  guarda el resultado y su archivo `.json` en `generations/`. Primero estima el coste y no
  gasta nada hasta que respondes `kie ok <créditos>`. Un hook lo garantiza.
- [`video-loop`](.claude/skills/video-loop/SKILL.md) convierte un vídeo generado en un
  bucle sin cortes. Se ejecuta en local con `ffmpeg`, así que no cuesta nada.

## Contribuir

- **Añadir un proveedor:** escribe una skill en `.claude/skills/` que termine guardando el
  medio y su sidecar en `generations/`. El muro no necesita ningún cambio.
- **Cambiar la interfaz:** es SvelteKit con las runes de Svelte 5. [CLAUDE.md](CLAUDE.md)
  indica el papel de cada archivo. Todo texto visible pasa por los diccionarios de
  [src/lib/i18n/](src/lib/i18n/), nunca escrito directamente en un componente.
- **Mantenerlo local:** ninguna dependencia de runtime aparte de SvelteKit, y ninguna
  llamada de red saliente. Los tipos de cambio están fijados en
  [src/lib/currency.ts](src/lib/currency.ts): actualízalos de vez en cuando.
- Ejecuta `npm run check` antes de abrir una PR.
