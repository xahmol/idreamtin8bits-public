import type { APIRoute } from 'astro';
import { A64_PRESETS, jsonResponse } from '../../../../lib/a64.ts';

export const GET: APIRoute = () => jsonResponse(A64_PRESETS);
