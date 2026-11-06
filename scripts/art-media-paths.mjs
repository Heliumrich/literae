export const artworkIdPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const deepZoomKeyPattern = /^[a-z0-9][a-z0-9-]{0,79}\/[a-f0-9]{24}$/;
export const artObjectPattern = /^[a-z0-9][a-z0-9-]{0,79}\/[a-f0-9]{24}\/(?:image\.dzi|(?:thumb|preview)\.webp|image_files\/(?:0|[1-9]\d?)\/(?:0|[1-9]\d{0,4})_(?:0|[1-9]\d{0,4})\.webp)$/;

export const artContentType = (key) => key.endsWith('.dzi') ? 'application/xml' : 'image/webp';
export const artCacheControl = 'public, max-age=31536000, immutable';
