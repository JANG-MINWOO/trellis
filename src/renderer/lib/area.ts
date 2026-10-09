import { ROOT_AREA } from '@shared/areas'

/** Display name of an area: the project root has no folder name; `short` keeps the last two parts. */
export function areaLabel(area: string, rootLabel: string, short = false): string {
  if (area === ROOT_AREA) return rootLabel
  return short ? area.split('/').slice(-2).join('/') : area
}
