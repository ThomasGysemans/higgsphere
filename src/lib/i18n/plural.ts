/**
 * Choisit entre singulier et pluriel selon les règles de la langue.
 *
 * Les règles diffèrent plus qu'on ne le croit : le français met 0 au singulier
 * (« 0 génération »), l'anglais et l'espagnol au pluriel. `Intl.PluralRules`
 * connaît ces règles ; un simple `n > 1` se tromperait dans une langue sur deux.
 */
export function pluralizer(locale: string) {
	const rules = new Intl.PluralRules(locale);
	return (count: number, one: string, other: string) =>
		rules.select(count) === 'one' ? one : other;
}
