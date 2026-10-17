import multer from "multer";

// Define the image formats permitted for profile-picture uploads.
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Configures profile-picture upload handling.
 *
 * Stores uploaded files temporarily in memory, enforces a maximum file size,
 * and restricts uploads to the supported image MIME types.
 */
const upload = multer({
  // Keep uploaded file data in memory for subsequent processing.
  storage: multer.memoryStorage(),

  // Limit uploaded files to 5 MB to reduce excessive memory consumption.
  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  // Reject files whose declared MIME type is not supported.
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(
        new Error(
          "Only JPEG, PNG, and WebP images are allowed for profile pictures.",
        ),
      );
      return;
    }

    // Accept the file for further processing.
    callback(null, true);
  },
});

// Process a single uploaded file submitted under the profilePicture field.
export default upload.single("profilePicture");
