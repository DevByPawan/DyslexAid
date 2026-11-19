/* eslint-disable react-refresh/only-export-components */
import { createContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [role, setRole] = useState(null);
    // isSuperAdmin is derived exclusively from the Firebase Auth ID token custom claim.
    // It is NEVER derived from a client-editable Firestore field.
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /**
     * Read the Firebase Auth ID token and extract the server-issued
     * custom claim { superadmin: true }.
     * forceRefresh: true ensures we get the latest claims after provisioning.
     */
    const readSuperAdminClaim = async (currentUser, forceRefresh = false) => {
        if (!currentUser) {
            setIsSuperAdmin(false);
            return false;
        }
        try {
            const idTokenResult = await currentUser.getIdTokenResult(forceRefresh);
            const claimed = idTokenResult.claims?.superadmin === true;
            setIsSuperAdmin(claimed);
            return claimed;
        } catch (err) {
            console.error("AuthContext: Error reading custom claim:", err);
            setIsSuperAdmin(false);
            return false;
        }
    };

    const fetchUserProfile = async (currentUser) => {
        if (!currentUser) {
            setUserProfile(null);
            setRole(null);
            return null;
        }

        try {
            const userDocRef = doc(db, "users", currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const profileData = userDocSnap.data();
                setUserProfile(profileData);
                // role field is used for UI display and routing convenience.
                // For Super Admin authorization, the token claim is the authority.
                setRole(profileData.role || null);
                return profileData;
            } else {
                // No Firestore profile – authenticated user without a document.
                setUserProfile(null);
                setRole(null);
                return null;
            }
        } catch (err) {
            console.error("AuthContext: Error fetching user profile:", err);
            setError(err);
            setUserProfile(null);
            setRole(null);
            return null;
        }
    };

    useEffect(() => {
        let isMounted = true;

        const unsubscribe = onAuthStateChanged(
            auth,
            async (currentUser) => {
                if (!isMounted) return;

                setError(null);
                setUser(currentUser);

                if (currentUser) {
                    // Run both fetches in parallel for speed.
                    // forceRefresh=false here; the provisioning script note
                    // instructs the admin to sign out/in to pick up new claims.
                    await Promise.all([
                        fetchUserProfile(currentUser),
                        readSuperAdminClaim(currentUser, false),
                    ]);
                } else {
                    setUserProfile(null);
                    setRole(null);
                    setIsSuperAdmin(false);
                }

                if (isMounted) {
                    setLoading(false);
                }
            },
            (authErr) => {
                console.error("AuthContext: Firebase onAuthStateChanged error:", authErr);
                if (isMounted) {
                    setError(authErr);
                    setUser(null);
                    setUserProfile(null);
                    setRole(null);
                    setIsSuperAdmin(false);
                    setLoading(false);
                }
            }
        );

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, []);

    const logout = async () => {
        try {
            await signOut(auth);
            setUser(null);
            setUserProfile(null);
            setRole(null);
            setIsSuperAdmin(false);
        } catch (err) {
            console.error("AuthContext: Error during logout:", err);
            throw err;
        }
    };

    const refreshUserProfile = async () => {
        if (auth.currentUser) {
            return await fetchUserProfile(auth.currentUser);
        }
        return null;
    };

    /**
     * Force-refresh the ID token to pick up newly set custom claims.
     * Call this once after the provisioning script has run and the admin
     * has signed back in, or after any server-side claim update.
     */
    const refreshClaims = async () => {
        if (auth.currentUser) {
            return await readSuperAdminClaim(auth.currentUser, true);
        }
        return false;
    };

    const value = {
        user,
        userProfile,
        role,
        isSuperAdmin,
        loading,
        error,
        logout,
        refreshUserProfile,
        refreshClaims,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export default AuthContext;
