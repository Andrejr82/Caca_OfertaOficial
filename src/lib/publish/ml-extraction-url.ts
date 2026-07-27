export function chooseMLExtractionUrl(
  inputUrl: string,
  resolvedUrl: string,
  confirmedIdentity: boolean,
  itemId?: string | null,
) {
  return confirmedIdentity && itemId ? inputUrl : resolvedUrl;
}
