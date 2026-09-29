import {
	DEFAULT_DISPLAY_CURRENCY,
	isDisplayCurrency,
	type DisplayCurrency
} from './currency';
import { readPreference, writePreference } from './storage';

const STORAGE_KEY = 'higgsphere.currency';

/**
 * Devise dans laquelle tous les montants sont affichés.
 *
 * Indépendante de la langue : parler anglais ne dit rien de la monnaie qu'on
 * utilise. L'euro reste la valeur par défaut, et le choix est mémorisé.
 *
 * Lue dans `format.ts` : tout montant formaté dans un template ou un
 * `$derived` se met donc à jour dès que l'utilisateur change de devise.
 */
class DisplayCurrencyStore {
	code = $state<DisplayCurrency>(DEFAULT_DISPLAY_CURRENCY);

	constructor() {
		const saved = readPreference(STORAGE_KEY);
		if (isDisplayCurrency(saved)) this.code = saved;
	}

	set(code: DisplayCurrency) {
		this.code = code;
		writePreference(STORAGE_KEY, code);
	}
}

export const displayCurrency = new DisplayCurrencyStore();
