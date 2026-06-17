import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../../lib/a64.ts';

const CATEGORIES = [
  { id:  0, name: 'Games',     type: 'games',     description: 'Games',     groupingName: 'games',     availableDownloadAllLevels: [0] },
  { id:  1, name: 'Demos',     type: 'demos',     description: 'Demos',     groupingName: 'demos',     availableDownloadAllLevels: [0] },
  { id:  2, name: 'C128',      type: 'c128',      description: 'C128',      groupingName: 'c128',      availableDownloadAllLevels: [0] },
  { id:  3, name: 'Graphics',  type: 'graphics',  description: 'Graphics',  groupingName: 'graphics',  availableDownloadAllLevels: [0] },
  { id:  4, name: 'Music',     type: 'music',     description: 'Music',     groupingName: 'music',     availableDownloadAllLevels: [0] },
  { id:  6, name: 'BBS',       type: 'bbs',       description: 'BBS',       groupingName: 'bbs',       availableDownloadAllLevels: [0] },
  { id:  7, name: 'Charts',    type: 'charts',    description: 'Charts',    groupingName: 'charts',    availableDownloadAllLevels: [0] },
  { id:  8, name: 'Tools',     type: 'tools',     description: 'Tools',     groupingName: 'tools',     availableDownloadAllLevels: [0] },
  { id:  9, name: 'Mags',      type: 'mags',      description: 'Mags',      groupingName: 'mags',      availableDownloadAllLevels: [0] },
  { id: 10, name: 'Easyflash', type: 'easyflash', description: 'Easyflash', groupingName: 'easyflash', availableDownloadAllLevels: [0] },
  { id: 11, name: 'Intros',    type: 'intros',    description: 'Intros',    groupingName: 'intros',    availableDownloadAllLevels: [0] },
  { id: 12, name: 'Misc',      type: 'misc',      description: 'Misc',      groupingName: 'misc',      availableDownloadAllLevels: [0] },
  { id: 25, name: 'Reu',       type: 'reu',       description: 'Reu',       groupingName: 'reu',       availableDownloadAllLevels: [0] },
];

export const GET: APIRoute = () => jsonResponse(CATEGORIES);
