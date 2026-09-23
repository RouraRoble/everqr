import type { APIRoute } from 'astro';
import { renderOg } from '../../../lib/og';
import guides from '../../../data/guides.json';

interface Guide {
  slug: string;
  title: string;
}

export function getStaticPaths() {
  return (guides as Guide[]).map((g) => ({ params: { slug: g.slug }, props: { g } }));
}

export const GET: APIRoute = async ({ props }) => {
  const { g } = props as { g: Guide };
  const png = await renderOg({ title: g.title, subtitle: 'A plain-language QR code guide', eyebrow: 'Guide' });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
