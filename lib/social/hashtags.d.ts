export function exactlyFiveHashtags(
  suggested: string[] | null | undefined,
  ctx?: {
    area?: string | null;
    city?: string | null;
    topic?: string | null;
    clinicName?: string | null;
  },
): string[];
