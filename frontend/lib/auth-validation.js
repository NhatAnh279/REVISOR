export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getPasswordError(password) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  return "";
}

// Maps raw Supabase Auth error messages to the copy this app shows.
export function mapAuthError(message) {
  const lower = (message || "").toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Invalid email or password";
  }
  if (lower.includes("email not confirmed")) {
    return "Please verify your email before logging in";
  }
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "An account with this email already exists";
  }
  return message || "Something went wrong. Please try again.";
}
