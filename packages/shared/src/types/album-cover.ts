export interface AlbumCoverResponseDto {
  defaultImageUrl: string | null;
  images: string[];
  selectedImageUrl: string | null;
  cached: boolean;
  /**
   * True only when this generation can request provider cover variants
   * (Suno music task → Suno cover API). False for Mureka and other providers.
   */
  variantsAvailable: boolean;
}
