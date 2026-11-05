/**
 * Code-unit ordering. `localeCompare` depends on the host's locale and ICU
 * data, which would make generated output differ between machines.
 */
export function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
