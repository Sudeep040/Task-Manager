import { NextRequest } from "next/server";
import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { apiSuccess, ApiError, getAuthUser, withAuth } from "@/lib/api-helpers";

// Files >= 20 MB use multipart upload; each part is 10 MB (S3 min part = 5 MB)
const MULTIPART_THRESHOLD = 20 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/avi",
  "video/mov",
  "video/x-msvideo",
]);

function getS3Client() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey || !process.env.AWS_S3_BUCKET) {
    throw new ApiError(500, "S3 is not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in your environment.", "S3_NOT_CONFIGURED");
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export const POST = withAuth(async (req: NextRequest) => {
  const user = getAuthUser(req);
  const body = await req.json();

  const { filename, contentType, fileSize } = body as {
    filename?: string;
    contentType?: string;
    fileSize?: number;
  };

  if (!filename || !contentType || typeof fileSize !== "number") {
    throw new ApiError(400, "filename, contentType, and fileSize are required", "VALIDATION_ERROR");
  }

  const isImage = ALLOWED_IMAGE_TYPES.has(contentType);
  const isVideo = ALLOWED_VIDEO_TYPES.has(contentType);
  if (!isImage && !isVideo) {
    throw new ApiError(400, "Only images (jpeg, png, gif, webp, svg) and videos (mp4, mov, webm, avi) are allowed", "INVALID_FILE_TYPE");
  }

  // 200 MB limit per file
  if (fileSize > 200 * 1024 * 1024) {
    throw new ApiError(400, "File size exceeds the 200 MB limit", "FILE_TOO_LARGE");
  }

  const s3 = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_REGION!;

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `uploads/${user.userId}/${crypto.randomUUID()}-${safeFilename}`;
  const fileType = isImage ? "image" : "video";
  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  if (fileSize < MULTIPART_THRESHOLD) {
    // Single presigned PUT URL
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: fileSize,
    });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return apiSuccess({
      type: "single" as const,
      uploadUrl,
      key,
      publicUrl,
      fileType,
      filename: safeFilename,
      fileSize,
    });
  }

  // Multipart upload for large files
  const createCmd = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType })
  );
  const uploadId = createCmd.UploadId!;

  const partCount = Math.ceil(fileSize / PART_SIZE);
  const parts = await Promise.all(
    Array.from({ length: partCount }, async (_, i) => {
      const partCmd = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: i + 1,
      });
      const uploadUrl = await getSignedUrl(s3, partCmd, { expiresIn: 3600 });
      const start = i * PART_SIZE;
      const end = Math.min(start + PART_SIZE, fileSize);
      return { partNumber: i + 1, uploadUrl, start, end };
    })
  );

  return apiSuccess({
    type: "multipart" as const,
    uploadId,
    key,
    parts,
    publicUrl,
    fileType,
    filename: safeFilename,
    fileSize,
  });
});
