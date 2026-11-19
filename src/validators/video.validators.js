import { z } from "zod";

const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
];

const ALLOWED_EXTENSIONS = ["mp4", "webm", "mov", "mkv", "avi"];

const MIME_EXTENSION_MAP = {
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "video/quicktime": ["mov", "mp4"],
  "video/x-matroska": ["mkv"],
  "video/x-msvideo": ["avi"],
};

export const createUploadRequestSchema = (maxFileSizeBytes = 500 * 1024 * 1024) => {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required").max(200, "Title cannot exceed 200 characters"),
      description: z.string().trim().min(1, "Description is required").max(2000, "Description cannot exceed 2000 characters"),
      fileName: z
        .string()
        .trim()
        .min(1, "fileName is required")
        .refine((name) => {
          const ext = name.split(".").pop()?.toLowerCase();
          return ext && ALLOWED_EXTENSIONS.includes(ext);
        }, `File extension must be one of: ${ALLOWED_EXTENSIONS.join(", ")}`),
      fileSize: z
        .number({ invalid_type_error: "fileSize must be a number" })
        .int("fileSize must be an integer")
        .positive("fileSize must be greater than 0")
        .max(
          maxFileSizeBytes,
          `File size exceeds maximum allowed size of ${Math.round(maxFileSizeBytes / (1024 * 1024))} MB`
        ),
      mimeType: z
        .string()
        .trim()
        .refine(
          (mime) => ALLOWED_MIME_TYPES.includes(mime.toLowerCase()),
          `MIME type must be one of: ${ALLOWED_MIME_TYPES.join(", ")}`
        ),
    })
    .refine(
      (data) => {
        const ext = data.fileName.split(".").pop()?.toLowerCase();
        const allowedForMime = MIME_EXTENSION_MAP[data.mimeType.toLowerCase()] || [];
        return allowedForMime.includes(ext);
      },
      {
        message: "File extension does not match the provided MIME type",
        path: ["fileName"],
      }
    );
};

export const uploadCompleteSchema = z.object({
  videoId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, "videoId must be a valid 24-character hexadecimal ObjectId"),
});

export { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MIME_EXTENSION_MAP };

