import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/a64.ts';

export const GET: APIRoute = () => jsonResponse([]);
