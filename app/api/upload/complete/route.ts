import { NextRequest } from "next/server";
import {
  S3Client,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { apiSuccess, ApiError, getAuthUser, withAuth } from "@/lib/api-helpers";

function getS3Client() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey || !process.env.AWS_S3_BUCKET) {
    throw new ApiError(500, "S3 is not configured", "S3_NOT_CONFIGURED");
  }

  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

export const POST = withAuth(async (req: NextRequest) => {
  getAuthUser(req);
  const body = await req.json();

  const { key, uploadId, parts } = body as {
    key?: string;
    uploadId?: string;
    parts?: { PartNumber: number; ETag: string }[];
  };

  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    throw new ApiError(400, "key, uploadId, and parts are required", "VALIDATION_ERROR");
  }

  const s3 = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET!;
  const region = process.env.AWS_REGION!;

  try {
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .sort((a, b) => a.PartNumber - b.PartNumber)
            .map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
        },
      })
    );
  } catch {
    // Abort the multipart upload to avoid leaving incomplete uploads in S3
    await s3
      .send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }))
      .catch(() => {});
    throw new ApiError(500, "Failed to complete multipart upload", "UPLOAD_COMPLETE_FAILED");
  }

  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return apiSuccess({ publicUrl, key });
});
