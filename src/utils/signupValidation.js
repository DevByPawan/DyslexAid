/**
 * Signup Form Validation Utility
 * ──────────────────────────────
 * Pure function providing pre-flight validation for user registration.
 * Validates fields before any network requests are dispatched to Firebase.
 */

export function validateSignupForm({ name, email, password, role, parentEmail }) {
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
        return { valid: false, message: "Please enter your full name." };
    }
    if (trimmedName.length > 100) {
        return { valid: false, message: "Full name must be 100 characters or fewer." };
    }

    const trimmedEmail = (email || "").trim();
    if (!trimmedEmail) {
        return { valid: false, message: "Please enter your email address." };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
        return { valid: false, message: "Please enter a valid email address." };
    }

    if (!password) {
        return { valid: false, message: "Please enter a password." };
    }
    if (password.length < 6) {
        return { valid: false, message: "Password must be at least 6 characters long." };
    }

    if (!role || !["student", "teacher", "parent"].includes(role)) {
        return { valid: false, message: "Please select an account role." };
    }

    if (role === "student") {
        const trimmedParentEmail = (parentEmail || "").trim();
        if (!trimmedParentEmail) {
            return { valid: false, message: "Parent email is required for student registration." };
        }
        if (!emailRegex.test(trimmedParentEmail)) {
            return { valid: false, message: "Please enter a valid parent email address." };
        }
        if (trimmedParentEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            return { valid: false, message: "Parent email cannot be identical to student email." };
        }
    }

    return { valid: true };
}

