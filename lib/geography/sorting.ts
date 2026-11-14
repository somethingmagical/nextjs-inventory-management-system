export function compareGeographyNames(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

export function comparePostalCodes(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function compareCallingCodes(left: string, right: string) {
  return Number(left) - Number(right);
}
