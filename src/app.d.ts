// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { DeleteErrorCode } from '$lib/types';

declare global {
	namespace App {
		/**
		 * `message` est un diagnostic technique, en anglais. Une erreur qui peut
		 * atteindre l'utilisateur porte aussi un `code`, traduit côté client.
		 */
		interface Error {
			message: string;
			code?: DeleteErrorCode;
		}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
