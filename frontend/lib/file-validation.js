export const ACCEPTED_EXTENSIONS = [".pdf", ".pptx"];
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB, mirrors backend/routers/upload.py

export function isAcceptedFile(file) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// Returns an error message if the file fails client-side validation
// (checked before it's even sent), or "" if it's fine.
export function getFileError(file) {
  if (!isAcceptedFile(file)) return "Only PDF and PPTX supported";
  if (file.size > MAX_FILE_SIZE_BYTES) return "File too large (max 20MB)";
  return "";
}
