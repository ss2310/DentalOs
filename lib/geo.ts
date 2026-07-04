// Parse a latitude/longitude out of free text a non-technical user can paste:
// a Google Maps link, or plain "lat, lng". No maps library — just regex.
//
// Handles the common Maps URL shapes:
//   https://www.google.com/maps/place/…/@28.6139,77.2090,15z   (the /@lat,lng)
//   https://www.google.com/maps/…!3d28.6139!4d77.2090          (place data)
//   https://maps.google.com/?q=28.6139,77.2090                 (?q= / ll= / center=)
// and plain "28.6139, 77.2090" or "28.6139 77.2090".

export type LatLng = { lat: number; lng: number };

const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";

function validate(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null; // null-island = "not set"
  return { lat, lng };
}

export function parseLatLng(input: string): LatLng | null {
  const s = (input ?? "").trim();
  if (!s) return null;

  const patterns = [
    new RegExp(`@${NUM},${NUM}`), //                     /@28.61,77.20,15z
    new RegExp(`!3d${NUM}!4d${NUM}`), //                 !3d28.61!4d77.20
    new RegExp(`[?&](?:q|ll|sll|center)=${NUM},${NUM}`), // ?q=28.61,77.20
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const hit = validate(Number(m[1]), Number(m[2]));
      if (hit) return hit;
    }
  }

  // Plain "lat, lng" or "lat lng".
  const plain = s.match(new RegExp(`^\\s*${NUM}\\s*[, ]\\s*${NUM}\\s*$`));
  if (plain) return validate(Number(plain[1]), Number(plain[2]));

  return null;
}
