import { describe, it, expect } from 'vitest';
import { svgToDataUrl } from './svg';

/**
 * The two fences: sanitised markup, then an <img> data URL. This suite pins
 * the first fence — what survives sanitising — and the refusal path.
 */

function decode(url: string): string {
	return decodeURIComponent(escape(atob(url.split(',')[1] ?? '')));
}

describe('svgToDataUrl', () => {
	it('renders an honest figure through unchanged', () => {
		const url = svgToDataUrl(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="4" height="4" fill="#888"/><text x="1" y="9">ok</text></svg>'
		);
		expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
		const svg = decode(url);
		expect(svg).toContain('<rect');
		expect(svg).toContain('ok');
	});

	it('strips scripts and event handlers but keeps the drawing', () => {
		const url = svgToDataUrl(
			'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="5" onclick="alert(2)"/></svg>'
		);
		const svg = decode(url);
		expect(svg).toContain('<circle');
		expect(svg).not.toContain('script');
		expect(svg).not.toContain('onclick');
	});

	it('refuses text with no svg in it, and unwraps svg buried in html', () => {
		expect(svgToDataUrl('# just markdown')).toBe('');
		// The SVG profile strips the foreign wrapper and keeps the drawing —
		// what survives is a legitimate (empty) svg, so it renders rather than
		// refuses. The fence is about executability, not pedantry.
		const unwrapped = svgToDataUrl('<div><svg></svg></div>');
		expect(decode(unwrapped)).toBe('<svg></svg>');
	});
});
