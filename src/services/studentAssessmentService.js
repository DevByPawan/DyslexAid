import { auth, db } from "../firebase";
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    documentId,
    doc,
    getDoc,
} from "firebase/firestore";

/**
 * Sanitize student assessment record.
 * Strict privacy boundary: Omit raw audio, waveforms, device tokens, or unneeded metadata.
 */
export function sanitizeStudentAssessment(docSnap) {
    const data = docSnap.data ? docSnap.data() : docSnap;
    const id = docSnap.id || data.id || "";

    const parseMillis = (val) => {
        if (!val) return null;
        if (typeof val.toMillis === "function") return val.toMillis();
        if (typeof val === "number" && !isNaN(val)) return val;
        if (typeof val === "string") {
            const parsed = Date.parse(val);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    };

    return {
        id,
        userId: data.userId || "",
        type: data.type || "comprehensive_screening",
        score: typeof data.score === "number" ? Math.min(100, Math.max(0, data.score)) : 0,
        accuracy: typeof data.accuracy === "number" ? Math.min(100, Math.max(0, data.accuracy)) : 0,
        risk: data.risk || "Unknown",
        mlRisk: data.mlRisk || "Unknown",
        subScores: {
            voiceAccuracy: typeof data.subScores?.voiceAccuracy === "number" ? data.subScores.voiceAccuracy : 0,
            letterScore: typeof data.subScores?.letterScore === "number" ? data.subScores.letterScore : 0,
            wordScore: typeof data.subScores?.wordScore === "number" ? data.subScores.wordScore : 0,
        },
        insights: {
            strengths: Array.isArray(data.insights?.strengths) ? data.insights.strengths : [],
            improvements: Array.isArray(data.insights?.improvements) ? data.insights.improvements : [],
        },
        completedAt: parseMillis(data.completedAt),
        createdAt: parseMillis(data.createdAt),
    };
}

/**
 * Fetch paginated historical assessments for the authenticated student.
 * Enforces ownership isolation: student can strictly only query own records.
 */
export async function fetchStudentAssessmentsPaginated({
    userId,
    pageSize = 5,
    cursorDoc = null,
} = {}) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("Authentication required to view assessment history.");
    }

    if (!userId || currentUser.uid !== userId) {
        throw new Error("Unauthorized: You can only access your own assessment history.");
    }

    const safeLimit = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));

    let q;
    if (cursorDoc) {
        q = query(
            collection(db, "assessments"),
            where("userId", "==", userId),
            orderBy("completedAt", "desc"),
            orderBy(documentId(), "desc"),
            startAfter(cursorDoc),
            limit(safeLimit + 1)
        );
    } else {
        q = query(
            collection(db, "assessments"),
            where("userId", "==", userId),
            orderBy("completedAt", "desc"),
            orderBy(documentId(), "desc"),
            limit(safeLimit + 1)
        );
    }

    const snapshot = await getDocs(q);
    const hasNext = snapshot.docs.length > safeLimit;
    const pageDocs = hasNext ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;
    const nextCursorDoc = hasNext && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

    const assessments = pageDocs.map((docSnap) => sanitizeStudentAssessment(docSnap));

    return {
        assessments,
        hasNext,
        nextCursorDoc,
        count: assessments.length,
    };
}

/**
 * Fetch chronological assessment timeline points for progress visualization.
 * Ordered chronologically by completedAt ASC.
 */
export async function fetchStudentProgressTimeline(userId) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("Authentication required to view progress trends.");
    }

    if (!userId || currentUser.uid !== userId) {
        throw new Error("Unauthorized: You can only view your own progress trends.");
    }

    const q = query(
        collection(db, "assessments"),
        where("userId", "==", userId),
        orderBy("completedAt", "desc"),
        orderBy(documentId(), "desc"),
        limit(20)
    );

    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((docSnap) => {
        const item = sanitizeStudentAssessment(docSnap);
        return {
            id: item.id,
            completedAt: item.completedAt,
            score: item.score,
            accuracy: item.accuracy,
            risk: item.risk,
            mlRisk: item.mlRisk,
            subScores: item.subScores,
        };
    });

    // Order chronologically for progress chart (oldest to newest of the recent 20)
    return docs.reverse();
}

/**
 * Fetch paginated historical assessments for an authorized teacher.
 * Enforces teacher approval and student explicit teacherAccess consent.
 */
export async function fetchTeacherStudentAssessmentsPaginated({
    studentId,
    pageSize = 5,
    cursorDoc = null,
} = {}) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("Authentication required to view student assessment history.");
    }

    if (!studentId) {
        throw new Error("Student ID is required.");
    }

    // 1. Verify current user is an approved teacher
    const teacherSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (
        !teacherSnap.exists() ||
        teacherSnap.data().role !== "teacher" ||
        teacherSnap.data().approvalStatus !== "approved" ||
        teacherSnap.data().accountStatus === "suspended"
    ) {
        throw new Error("Unauthorized: Only approved teachers may view student assessment records.");
    }

    // 2. Verify student has granted teacherAccess permission
    const permSnap = await getDoc(doc(db, "permissions", studentId));
    if (!permSnap.exists() || !permSnap.data().teacherAccess) {
        throw new Error("Unauthorized: This student has not granted teacher access permissions.");
    }

    const safeLimit = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));

    let q;
    if (cursorDoc) {
        q = query(
            collection(db, "assessments"),
            where("userId", "==", studentId),
            orderBy("completedAt", "desc"),
            orderBy(documentId(), "desc"),
            startAfter(cursorDoc),
            limit(safeLimit + 1)
        );
    } else {
        q = query(
            collection(db, "assessments"),
            where("userId", "==", studentId),
            orderBy("completedAt", "desc"),
            orderBy(documentId(), "desc"),
            limit(safeLimit + 1)
        );
    }

    const snapshot = await getDocs(q);
    const hasNext = snapshot.docs.length > safeLimit;
    const pageDocs = hasNext ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;
    const nextCursorDoc = hasNext && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

    const assessments = pageDocs.map((docSnap) => sanitizeStudentAssessment(docSnap));

    return {
        assessments,
        hasNext,
        nextCursorDoc,
        count: assessments.length,
    };
}

/**
 * Fetch chronological assessment timeline points for teacher progress visualization.
 */
export async function fetchTeacherStudentProgressTimeline(studentId) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("Authentication required to view student progress trends.");
    }

    if (!studentId) {
        throw new Error("Student ID is required.");
    }

    // 1. Verify current user is an approved teacher
    const teacherSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (
        !teacherSnap.exists() ||
        teacherSnap.data().role !== "teacher" ||
        teacherSnap.data().approvalStatus !== "approved" ||
        teacherSnap.data().accountStatus === "suspended"
    ) {
        throw new Error("Unauthorized: Only approved teachers may view student progress trends.");
    }

    // 2. Verify student has granted teacherAccess permission
    const permSnap = await getDoc(doc(db, "permissions", studentId));
    if (!permSnap.exists() || !permSnap.data().teacherAccess) {
        throw new Error("Unauthorized: This student has not granted teacher access permissions.");
    }

    const q = query(
        collection(db, "assessments"),
        where("userId", "==", studentId),
        orderBy("completedAt", "desc"),
        orderBy(documentId(), "desc"),
        limit(20)
    );

    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((docSnap) => {
        const item = sanitizeStudentAssessment(docSnap);
        return {
            id: item.id,
            completedAt: item.completedAt,
            score: item.score,
            accuracy: item.accuracy,
            risk: item.risk,
            mlRisk: item.mlRisk,
            subScores: item.subScores,
        };
    });

    return docs.reverse();
}

/**
 * Fetch paginated historical assessments for an authorized parent.
 * Enforces parent approval and matching parentEmail on student profile.
 */
export async function fetchParentChildAssessmentsPaginated({
    childId,
    pageSize = 5,
    cursorDoc = null,
} = {}) {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
        throw new Error("Authentication required to view child assessment history.");
    }

    if (!childId) {
        throw new Error("Child ID is required.");
    }

    // 1. Verify current user is an approved parent
    const parentSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (
        !parentSnap.exists() ||
        parentSnap.data().role !== "parent" ||
        parentSnap.data().approvalStatus !== "approved" ||
        parentSnap.data().accountStatus === "suspended"
    ) {
        throw new Error("Unauthorized: Only approved parents may view child assessment records.");
    }

    // 2. Verify child is linked to this parent's email
    const childSnap = await getDoc(doc(db, "users", childId));
    if (
        !childSnap.exists() ||
        childSnap.data().role !== "student" ||
        !childSnap.data().parentEmail ||
        childSnap.data().parentEmail.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()
    ) {
        throw new Error("Unauthorized: You can only access assessment records for your linked child.");
    }

    const safeLimit = Math.min(20, Math.max(1, parseInt(pageSize, 10) || 5));

    let q;
    if (cursorDoc) {
        q = query(
            collection(db, "assessments"),
            where("userId", "==", childId),
            orderBy("completedAt", "desc"),
            orderBy(documentId(), "desc"),
            startAfter(cursorDoc),
            limit(safeLimit + 1)
        );
    } else {
        q = query(
            collection(db, "assessments"),
            where("userId", "==", childId),
            orderBy("completedAt", "desc"),
            orderBy(documentId(), "desc"),
            limit(safeLimit + 1)
        );
    }

    const snapshot = await getDocs(q);
    const hasNext = snapshot.docs.length > safeLimit;
    const pageDocs = hasNext ? snapshot.docs.slice(0, safeLimit) : snapshot.docs;
    const nextCursorDoc = hasNext && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

    const assessments = pageDocs.map((docSnap) => sanitizeStudentAssessment(docSnap));

    return {
        assessments,
        hasNext,
        nextCursorDoc,
        count: assessments.length,
    };
}

/**
 * Fetch chronological assessment timeline points for parent progress visualization.
 */
export async function fetchParentChildProgressTimeline(childId) {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
        throw new Error("Authentication required to view child progress trends.");
    }

    if (!childId) {
        throw new Error("Child ID is required.");
    }

    // 1. Verify current user is an approved parent
    const parentSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (
        !parentSnap.exists() ||
        parentSnap.data().role !== "parent" ||
        parentSnap.data().approvalStatus !== "approved" ||
        parentSnap.data().accountStatus === "suspended"
    ) {
        throw new Error("Unauthorized: Only approved parents may view child progress trends.");
    }

    // 2. Verify child is linked to this parent's email
    const childSnap = await getDoc(doc(db, "users", childId));
    if (
        !childSnap.exists() ||
        childSnap.data().role !== "student" ||
        !childSnap.data().parentEmail ||
        childSnap.data().parentEmail.trim().toLowerCase() !== currentUser.email.trim().toLowerCase()
    ) {
        throw new Error("Unauthorized: You can only view progress trends for your linked child.");
    }

    const q = query(
        collection(db, "assessments"),
        where("userId", "==", childId),
        orderBy("completedAt", "desc"),
        orderBy(documentId(), "desc"),
        limit(20)
    );

    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((docSnap) => {
        const item = sanitizeStudentAssessment(docSnap);
        return {
            id: item.id,
            completedAt: item.completedAt,
            score: item.score,
            accuracy: item.accuracy,
            risk: item.risk,
            mlRisk: item.mlRisk,
            subScores: item.subScores,
        };
    });

    return docs.reverse();
}
