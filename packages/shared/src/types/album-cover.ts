export interface AlbumCoverResponseDto {
  defaultImageUrl: string | null;
  images: string[];
  selectedImageUrl: string | null;
  cached: boolean;
  /**
   * True only when this generation can request provider cover variants
   * (Legacyengine music task → Legacyengine cover API). False for Audioengine and other providers.
   */
  variantsAvailable: boolean;
}
