import type { Messages } from './en';
import { pluralizer } from './plural';

const plural = pluralizer('es');

export const es: Messages = {
	language: {
		label: 'Idioma'
	},

	live: {
		on: 'Vigilando archivos nuevos',
		off: 'Sin conexión'
	},

	common: {
		retry: 'Reintentar',
		copy: 'copiar',
		copied: 'copiado',
		reset: 'restablecer',
		readWarnings: (count) =>
			plural(count, `${count} aviso de lectura`, `${count} avisos de lectura`)
	},

	sort: {
		newest: 'Más reciente',
		oldest: 'Más antiguo',
		'cost-desc': 'Coste ↓',
		'size-desc': 'Tamaño ↓',
		name: 'Nombre A→Z'
	},

	bar: {
		searchPlaceholder: 'Buscar un prompt, un modelo, una etiqueta…',
		searchLabel: 'Buscar',
		sortBy: 'Ordenar por',
		filters: 'Filtros',
		spend: 'Gastos',
		spendTitle: 'Gastos por proveedor',
		type: 'Tipo',
		images: 'Imágenes',
		videos: 'Vídeos',
		model: 'Modelo',
		service: 'Servicio',
		tags: 'Etiquetas',
		facetsHint:
			'Añade archivos `.json` junto a tus medios para filtrar por modelo, servicio o etiqueta.',
		generations: (count) => plural(count, 'generación', 'generaciones'),
		ofTotal: (total) => `de ${total}`,
		totalConverted: 'Total convertido a euros',
		excludedFromTotal: (count) =>
			plural(
				count,
				`${count} importe excluido del total: divisa sin tipo de cambio`,
				`${count} importes excluidos del total: divisa sin tipo de cambio`
			),
		notConverted: (count) => plural(count, `+${count} sin convertir`, `+${count} sin convertir`)
	},

	wall: {
		loading: 'Leyendo la carpeta `generations/`…',
		errorTitle: 'No se pudo leer el índice',
		emptyTitle: 'El muro está vacío',
		emptyBody:
			'Deja tus imágenes y vídeos generados en `generations/`, cada uno con un archivo `.json` del mismo nombre al lado. Aparecerán aquí sin recargar la página.',
		noResultsTitle: 'Sin resultados',
		noResultsBody: 'Ninguna generación coincide con esta búsqueda.',
		resetFilters: 'Restablecer filtros'
	},

	tile: {
		open: (label) => `Abrir: ${label}`,
		fresh: 'nuevo'
	},

	clamped: {
		more: 'ver más',
		less: 'ver menos'
	},

	lightbox: {
		dialogLabel: 'Detalle de la generación',
		previous: 'Anterior',
		next: 'Siguiente',
		close: 'Cerrar',
		prompt: 'Prompt',
		noPrompt: 'El sidecar no contiene ningún prompt.',
		negativePrompt: 'Prompt negativo',
		model: 'Modelo',
		service: 'Servicio',
		type: 'Tipo',
		image: 'Imagen',
		video: 'Vídeo',
		dimensions: 'Dimensiones',
		duration: 'Duración',
		size: 'Tamaño',
		cost: 'Coste estimado',
		convertedTitle: 'Importe facturado por el servicio, convertido a título orientativo',
		convertedFrom: (amount) => `convertido de ${amount}`,
		noRate: (currency) => `divisa ${currency} sin tipo de cambio`,
		date: 'Fecha',
		seed: 'Semilla',
		tags: 'Etiquetas',
		notes: 'Notas',
		extras: 'Otros metadatos',
		file: 'Archivo',
		copyPath: 'Copiar la ruta',
		noSidecar: 'Ningún archivo de metadatos asociado.',
		badSidecar: (reason) => `Sidecar ilegible: ${reason}`,
		openRaw: 'Abrir el archivo original ↗',
		confirmDelete: (withSidecar) =>
			`¿Eliminar definitivamente este archivo${withSidecar ? ' y su sidecar' : ''}? Esta acción no se puede deshacer.`,
		delete: 'Eliminar',
		deleting: 'Eliminando…',
		cancel: 'Cancelar',
		deleteTrigger: 'Eliminar este medio',
		deleteFailed: (reason) => `No se pudo eliminar: ${reason}`,
		deleteErrors: {
			not_found: 'el archivo ya no está en el disco.',
			ledger_failed: 'el gasto no pudo registrarse en el historial, así que no se eliminó nada.',
			unlink_failed: 'no se pudo borrar el archivo. El historial no se ha modificado.'
		}
	},

	stats: {
		pageTitle: 'Gastos · higgsphere',
		title: 'Gastos',
		back: 'El muro',
		loading: 'Leyendo los gastos…',
		errorTitle: 'No se pudieron leer los gastos',
		emptyTitle: 'Ningún gasto registrado',
		emptyBody:
			'Cada generación que dejes en `generations/` con un campo `cost` en su sidecar aparecerá aquí, y seguirá aquí incluso después de eliminar el medio.',
		totalSpent: 'Total gastado',
		generations: (count) => plural(count, `${count} generación`, `${count} generaciones`),
		since: (date) => `desde el ${date}`,
		averageCost: 'Coste medio',
		averageSub: 'por generación con coste conocido',
		lastSpend: 'Último gasto',
		withoutCost: (count) =>
			plural(count, `${count} generación sin coste.`, `${count} generaciones sin coste.`),
		unconvertible: (count) =>
			plural(
				count,
				`${count} importe en una divisa sin tipo conocido, excluido del total.`,
				`${count} importes en una divisa sin tipo conocido, excluidos del total.`
			),
		caveatEnd: 'El total solo cuenta lo que puede convertir.',
		noMatchTitle: 'Ningún gasto',
		noMatchBody: 'Ningún gasto coincide con esta selección.',
		resetButton: 'Restablecer',
		timeline: 'Cronología',
		byMonth: 'por mes',
		byDay: 'por día',
		oldestLeft: 'lo más antiguo a la izquierda',
		chartLabel: 'Gastos a lo largo del tiempo',
		byProvider: 'Por proveedor',
		providers: (count) => plural(count, `${count} proveedor`, `${count} proveedores`),
		shareOfTotal: (percent) => `${percent} del total`,
		deleted: (count) => plural(count, `${count} eliminada`, `${count} eliminadas`),
		withoutCostShort: (count) => `${count} sin coste`,
		notConverted: (count) => `${count} sin convertir`,
		journal: 'Historial',
		newestFirst: 'lo más reciente primero',
		deletedOn: (date) => `Medio eliminado el ${date}`,
		deletedBadge: 'eliminado',
		image: 'imagen',
		unknownService: 'Proveedor desconocido',
		unknownModel: 'Modelo desconocido',
		ledgerNote: (path) =>
			`Cada generación se registra en \`${path}\` en cuanto aparece: su precio sigue contando aquí aunque se elimine el medio.`
	}
};
