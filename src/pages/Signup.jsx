import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import toast from "react-hot-toast";
import { Eye, EyeOff, ChevronDown, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { validateSignupForm } from "../utils/signupValidation";

/**
 * Idempotently writes or recovers user profile and permissions in Firestore,
 * and requests registration approval through the trusted backend API.
 * Never overwrites an already approved, rejected, or suspended user status.
 */
async function ensureUserProfileAndApproval(user, { name, role, parentEmail }) {
    const trimmedName = (name || "").trim();
    const cleanParentEmail = role === "student" ? (parentEmail || "").trim() : "";
    const uid = user.uid;

    // 1. User document in users/{uid} (owner has create/read access)
    const userDocRef = doc(db, "users", uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
        await setDoc(userDocRef, {
            name: trimmedName,
            email: user.email,
            role,
            approvalStatus: "pending",
            accountStatus: "active",
            parentEmail: cleanParentEmail,
            xp: 0,
            streak: 0,
            badges: 0,
            guardianPin: "",
            trustedDevices: [],
            practiceVoiceCompleted: false,
            practiceLetterCompleted: false,
            practiceWordCompleted: false,
            createdAt: new Date(),
        });
    } else {
        // Idempotent recovery: do not overwrite approved, rejected, or suspended user status
        const existingData = userSnap.data();
        if (!existingData.approvalStatus) {
            await setDoc(
                userDocRef,
                {
                    approvalStatus: "pending",
                    accountStatus: existingData.accountStatus || "active",
                },
                { merge: true }
            );
        }
    }

    // 2. Student Privacy Permissions document in permissions/{uid}
    const permDocRef = doc(db, "permissions", uid);
    const permSnap = await getDoc(permDocRef);
    if (!permSnap.exists()) {
        await setDoc(permDocRef, {
            teacherAccess: false,
            parentAccess: true,
            consentGiven: false,
        });
    }

    // 3. Register approval request via trusted backend API
    // Strictly awaited: Registration completion requires confirmed approval request creation.
    let res;
    try {
        const idToken = await user.getIdToken();
        const serverBaseUrl = (import.meta.env.VITE_ADMIN_API_URL || "http://localhost:3001/api/admin")
            .replace(/\/api\/admin\/?$/, "");

        res = await fetch(`${serverBaseUrl}/api/registration/request-approval`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                name: trimmedName,
                role,
                parentEmail: cleanParentEmail,
            }),
        });
    } catch {
        throw new Error(
            "Unable to reach the approval registration service. Please ensure the backend server is running and click Sign Up to retry."
        );
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        throw new Error(
            data.error || "Approval request could not be registered. Please click Sign Up to retry."
        );
    }

    return {
        success: true,
        approvalStatus: data.approvalStatus || "pending",
        accountStatus: data.accountStatus || "active",
        role: data.role || role,
    };
}

export default function Signup() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState("student");
    const [parentEmail, setParentEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { refreshUserProfile } = useAuth();
    const navigate = useNavigate();

    const handleSignup = async (e) => {
        e.preventDefault();

        // Prevent duplicate concurrent submissions
        if (isSubmitting) return;

        // 1. Precise field-level validation before calling Firebase
        const validation = validateSignupForm({ name, email, password, role, parentEmail });
        if (!validation.valid) {
            toast.error(validation.message);
            return;
        }

        setIsSubmitting(true);

        try {
            let user = null;

            // 2. Firebase Auth Account Creation or Active Session Recovery
            try {
                const userCredential = await createUserWithEmailAndPassword(
                    auth,
                    email.trim(),
                    password
                );
                user = userCredential.user;
            } catch (authError) {
                if (authError.code === "auth/email-already-in-use") {
                    // Check if the current authenticated session matches the email (profile recovery scenario)
                    if (auth.currentUser && auth.currentUser.email?.toLowerCase() === email.trim().toLowerCase()) {
                        user = auth.currentUser;
                    } else {
                        toast.error("An account with this email already exists. Please log in instead.");
                        setIsSubmitting(false);
                        return;
                    }
                } else if (authError.code === "auth/weak-password") {
                    toast.error("Password is too weak. Please choose a stronger password.");
                    setIsSubmitting(false);
                    return;
                } else if (authError.code === "auth/invalid-email") {
                    toast.error("The email address is invalid.");
                    setIsSubmitting(false);
                    return;
                } else {
                    toast.error(authError.message || "Registration failed. Please try again.");
                    setIsSubmitting(false);
                    return;
                }
            }

            // 3. Create or Recover Firestore Profile and Approval Request
            if (user) {
                try {
                    const result = await ensureUserProfileAndApproval(user, { name, role, parentEmail });

                    // Synchronize AuthContext state before navigation
                    let profile = null;
                    if (typeof refreshUserProfile === "function") {
                        profile = await refreshUserProfile();
                    }

                    const finalApprovalStatus = profile?.approvalStatus || result?.approvalStatus || "pending";
                    const finalAccountStatus = profile?.accountStatus || result?.accountStatus || "active";
                    const finalRole = profile?.role || result?.role || role;

                    // Reset form fields
                    setName("");
                    setEmail("");
                    setPassword("");
                    setParentEmail("");

                    // Route strictly according to account and approval status
                    // 1. Suspended -> /account-suspended
                    if (finalAccountStatus === "suspended") {
                        toast.error("Your account has been suspended.");
                        navigate("/account-suspended", { replace: true });
                        return;
                    }

                    // 2. Rejected -> /account-rejected
                    if (finalApprovalStatus === "rejected") {
                        toast.error("Your registration was not approved.");
                        navigate("/account-rejected", { replace: true });
                        return;
                    }

                    // 3. Approved + Active -> appropriate role dashboard
                    if (finalApprovalStatus === "approved" && finalAccountStatus === "active") {
                        toast.success("Welcome back! Your account is approved.");
                        if (finalRole === "teacher") {
                            navigate("/teacher-dashboard", { replace: true });
                        } else if (finalRole === "parent") {
                            navigate("/parent-dashboard", { replace: true });
                        } else {
                            navigate("/dashboard", { replace: true });
                        }
                        return;
                    }

                    // 4. Pending + Active -> /pending-approval
                    toast.success("Account registered! Awaiting Super Admin approval.");
                    navigate("/pending-approval", { replace: true });
                } catch (registrationError) {
                    console.error("Registration error:", registrationError);
                    toast.error(
                        registrationError.message ||
                        "Registration could not be completed. Click Sign Up again to retry."
                    );
                }
            }
        } catch (generalError) {
            console.error("Unexpected signup error:", generalError);
            toast.error("An unexpected error occurred during signup. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 px-6">
            <div className="w-full max-w-md backdrop-blur-2xl bg-white/10 border border-white/10 rounded-[40px] p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-3">
                        Create Account
                    </h1>
                    <p className="text-gray-300">
                        Join DyslexAid Today
                    </p>
                </div>

                <form onSubmit={handleSignup} className="space-y-5">
                    <input
                        type="text"
                        placeholder="Full Name"
                        value={name}
                        disabled={isSubmitting}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full p-4 rounded-2xl bg-white/10 border border-white/10 text-white outline-none disabled:opacity-50"
                    />

                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        disabled={isSubmitting}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-4 rounded-2xl bg-white/10 border border-white/10 text-white outline-none disabled:opacity-50"
                    />

                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password (minimum 6 characters)"
                            value={password}
                            disabled={isSubmitting}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-4 rounded-2xl bg-white/10 border border-white/10 text-white outline-none pr-14 disabled:opacity-50"
                        />

                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-5 flex items-center text-white/50 hover:text-cyan-300 transition-colors duration-200"
                        >
                            {showPassword ? (
                                <EyeOff size={20} strokeWidth={2} />
                            ) : (
                                <Eye size={20} strokeWidth={2} />
                            )}
                        </button>
                    </div>

                    <div className="relative">
                        <select
                            value={role}
                            disabled={isSubmitting}
                            onChange={(e) => setRole(e.target.value)}
                            className="
                                w-full
                                py-5
                                px-5
                                pr-14
                                rounded-2xl
                                bg-white/10
                                border
                                border-white/10
                                text-white
                                outline-none
                                appearance-none
                                disabled:opacity-50
                            "
                        >
                            <option value="student" className="text-black">
                                Student
                            </option>
                            <option value="parent" className="text-black">
                                Parent
                            </option>
                            <option value="teacher" className="text-black">
                                Teacher
                            </option>
                        </select>

                        <ChevronDown
                            size={20}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none"
                        />
                    </div>

                    {role === "student" && (
                        <input
                            type="email"
                            placeholder="Parent Email"
                            value={parentEmail}
                            disabled={isSubmitting}
                            onChange={(e) => setParentEmail(e.target.value)}
                            className="w-full p-4 rounded-2xl bg-white/10 border border-white/10 text-white outline-none disabled:opacity-50"
                        />
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-pink-400 text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span>Creating Account...</span>
                            </>
                        ) : (
                            "Sign Up"
                        )}
                    </button>
                </form>

                <p className="text-center text-gray-400 mt-6">
                    Already have an account?
                    <Link
                        to="/login"
                        className="text-cyan-300 hover:text-cyan-200"
                    >
                        {" "}Login
                    </Link>
                </p>
            </div>
        </div>
    );
}
