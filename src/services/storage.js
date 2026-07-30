const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

let client;

function config() {
  return {
    endpoint:
      process.env.STORAGE_ENDPOINT ||
      process.env.ENDPOINT ||
      process.env.AWS_ENDPOINT_URL,
    bucket:
      process.env.STORAGE_BUCKET ||
      process.env.BUCKET ||
      process.env.AWS_S3_BUCKET_NAME,
    region:
      process.env.STORAGE_REGION ||
      process.env.REGION ||
      process.env.AWS_DEFAULT_REGION ||
      'auto',
    accessKeyId:
      process.env.STORAGE_ACCESS_KEY_ID ||
      process.env.ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.STORAGE_SECRET_ACCESS_KEY ||
      process.env.SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY,
  };
}

function isConfigured() {
  const value = config();
  return Boolean(
    value.endpoint &&
      value.bucket &&
      value.accessKeyId &&
      value.secretAccessKey,
  );
}

function getClient() {
  if (!isConfigured()) throw new Error('Railway object storage is not configured');
  if (!client) {
    const value = config();
    client = new S3Client({
      endpoint: value.endpoint,
      region: value.region,
      credentials: {
        accessKeyId: value.accessKeyId,
        secretAccessKey: value.secretAccessKey,
      },
    });
  }
  return client;
}

async function upload({ key, body, contentType }) {
  const value = config();
  await getClient().send(
    new PutObjectCommand({
      Bucket: value.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public,max-age=31536000,immutable',
    }),
  );
  return key;
}

async function get(key) {
  const value = config();
  return getClient().send(
    new GetObjectCommand({
      Bucket: value.bucket,
      Key: key,
    }),
  );
}

async function remove(key) {
  const value = config();
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: value.bucket,
      Key: key,
    }),
  );
}

module.exports = { get, isConfigured, remove, upload };
