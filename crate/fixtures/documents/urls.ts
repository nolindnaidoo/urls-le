// TypeScript: the whole document is scanned, comments included.
// See https://ts-comment.example.com/docs for the rationale.
interface Endpoint {
	readonly url: string;
}

const API: Endpoint = { url: 'https://api.example.com/v2' };
const LEGACY = "http://legacy.example.com/v1";
const TEMPLATE = `ftp://mirror.example.com/pub/ts`;

/* A block comment holding mailto:support@example.com */
export function contact(): string {
	return API.url ?? LEGACY;
}
