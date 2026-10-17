function getFileExtension(file) {
  const originalName = file?.originalname ?? "profile-picture";
  const match = originalName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "png";
}

// Validates the profile picture, verifies storage configuration, and generates the expected storage URL.
export async function uploadProfilePicture(userId, file) {
  // Validate the uploaded file and throw an error if the required file data is missing.
  if (!file || !file.buffer || !file.mimetype) {
    const error = new Error("Profile picture upload is required");
    error.code = "UPLOAD_REQUIRED";
    throw error;
  }

  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  // Reject the upload if the file's MIME type is not supported.
  if (!allowedMimeTypes.has(file.mimetype)) {
    const error = new Error(
      "Unsupported profile picture format. Use JPEG, PNG, or WebP.",
    );
    error.code = "UNSUPPORTED_FILE_TYPE";
    throw error;
  }

  // Check whether at least one supported profile picture storage provider is configured through environment variables.
  const hasConfiguredStorage = Boolean(
    process.env.PROFILE_PICTURE_STORAGE_URL ||
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.S3_BUCKET_NAME,
  );

  // Throw a configuration error if no supported profile picture storage provider is configured.
  if (!hasConfiguredStorage) {
    const error = new Error(
      "Profile picture storage is not configured in this environment.",
    );
    error.code = "STORAGE_CONFIGURATION_MISSING";
    throw error;
  }

  const extension = getFileExtension(file);

  // Generate and return the expected profile picture URL using the user's ID and file extension.
  return `https://example.test/users/${userId}/profile-picture.${extension}`;
}

export default { uploadProfilePicture };
