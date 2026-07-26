import DOMPurify from 'dompurify';

/**
 * Model-authored SVG, made showable.
 *
 * An agent asked for a poster will sometimes just write one — SVG is text, and
 * text is what it is good at. That is worth embracing (crisp at every zoom,
 * costs nothing, diffable like any other file), but the markup is exactly as
 * untrusted as any other model output, and once the research tools run it is
 * partly *paper*-derived. So it goes through DOMPurify's SVG profile — scripts,
 * foreignObject and event handlers stripped — and is then embedded through an
 * `<img>` data URL, where the browser executes nothing at all. Two fences,
 * either of which would do alone.
 */
export function svgToDataUrl(source: string): string {
	const clean = DOMPurify.sanitize(source, {
		USE_PROFILES: { svg: true, svgFilters: true }
	}).trim();
	// Whatever survived sanitising must still BE an svg, or this is not a figure.
	if (!/^<svg[\s>]/i.test(clean)) return '';
	// base64 rather than a utf8 data URL: the markup is full of quotes and
	// hashes that would otherwise need per-context escaping.
	return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(clean)))}`;
}
