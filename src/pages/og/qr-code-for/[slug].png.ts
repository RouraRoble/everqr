import type { APIRoute } from 'astro';
import { renderOg } from '../../../lib/og';
import usecases from '../../../data/usecases.json';

interface Usecase {
  slug: string;
  name: string;
  h1: string;
}

export function getStaticPaths() {
  return (usecases as Usecase[]).map((u) => ({ params: { slug: u.slug }, props: { u } }));
}

export const GET: APIRoute = async ({ props }) => {
  const { u } = props as { u: Usecase };
  const png = await renderOg({ title: u.h1, subtitle: 'Free, no sign-up, never expires', eyebrow: 'QR code for…' });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
