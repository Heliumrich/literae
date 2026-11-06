import { S3Client } from '@aws-sdk/client-s3';

export function artStorage() {
  const { ART_S3_ENDPOINT, ART_S3_REGION, ART_S3_BUCKET, ART_S3_KEY, ART_S3_SECRET } = process.env;
  if (!ART_S3_ENDPOINT || !ART_S3_REGION || !ART_S3_BUCKET || !ART_S3_KEY || !ART_S3_SECRET) {
    throw new Error('Variables ART_S3_ENDPOINT, ART_S3_REGION, ART_S3_BUCKET, ART_S3_KEY et ART_S3_SECRET requises.');
  }
  if (new URL(ART_S3_ENDPOINT).protocol !== 'https:') throw new Error('Endpoint S3 HTTPS requis.');
  return {
    bucket: ART_S3_BUCKET,
    s3: new S3Client({
      endpoint: ART_S3_ENDPOINT, region: ART_S3_REGION, forcePathStyle: true,
      credentials: { accessKeyId: ART_S3_KEY, secretAccessKey: ART_S3_SECRET },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
    }),
  };
}
