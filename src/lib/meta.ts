/**
 * Who and where.
 *
 * One place, because these strings appear in the header, the about dialog and
 * the README-facing chrome, and three copies of a URL is two chances to be
 * wrong about it.
 */
export const REPO_URL = 'https://github.com/NeoVand/harnessXray';

/**
 * Where the built app lives.
 *
 * Hardcoded rather than derived from `paths.base`, because the one consumer
 * that matters — the Open Graph card in app.html — is read by scrapers that
 * never run our JavaScript and need an absolute URL. Kept here so the string
 * has a home; app.html carries its own literal copy for the same reason it
 * carries the theme boot script (it runs before any module can be imported).
 */
export const SITE_URL = 'https://neovand.github.io/harnessXray/';

export const AUTHOR = {
	name: 'Neo Mohsenvand',
	github: 'https://github.com/NeoVand',
	linkedin: 'https://www.linkedin.com/in/mohsenvand/'
} as const;
