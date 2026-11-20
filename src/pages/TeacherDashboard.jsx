import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
    collection,
    getDocs,
    query,
    orderBy,
    limit,
    doc,
    getDoc,
    addDoc
} from "firebase/firestore";
import { generateReportPDF } from "../utils/generateReportPDF";
import toast from "react-hot-toast";
import StudentAssessmentHistory from "../components/student/StudentAssessmentHistory";

export default function TeacherDashboard() {

    const navigate = useNavigate();
    const [totalStudents, setTotalStudents] = useState(0);
    const [sharedReports, setSharedReports] = useState(0);
    const [activityCount, setActivityCount] = useState(0);
    const [recentLogs, setRecentLogs] = useState([]);
    const [teacherStudents, setTeacherStudents] = useState([]);
    const [activeHistoryStudent, setActiveHistoryStudent] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [showPinModal, setShowPinModal] = useState(false);
    const [enteredPin, setEnteredPin] = useState("");
    const [loading, setLoading] = useState(true);
    const handleLogout = async () => {
        await signOut(auth);
        navigate("/");
    };
    useEffect(() => {

        const fetchStats = async () => {
            try {
                // Fetch student permissions (approved teachers are granted read access by firestore.rules)
                const permissionsSnap = await getDocs(
                    collection(db, "permissions")
                );

                let shared = 0;
                const allowedStudents = [];

                // Fetch profiles strictly for students who granted explicit teacherAccess consent
                for (const permissionDoc of permissionsSnap.docs) {
                    if (permissionDoc.data().teacherAccess) {
                        shared++;
                        const studentDoc = await getDoc(
                            doc(db, "users", permissionDoc.id)
                        );
                        if (
                            studentDoc.exists() &&
                            studentDoc.data().role === "student"
                        ) {
                            allowedStudents.push({
                                id: studentDoc.id,
                                ...studentDoc.data()
                            });
                        }
                    }
                }

                setTotalStudents(permissionsSnap.size || allowedStudents.length);
                setSharedReports(shared);
                setTeacherStudents(allowedStudents);
                if (allowedStudents.length > 0) {
                    setActiveHistoryStudent((prev) => prev || allowedStudents[0]);
                }

            // Activity Logs
            const logsSnap = await getDocs(
                collection(db, "activityLogs")
            );
            const logsQuery = query(
                collection(db, "activityLogs"),
                orderBy("timestamp", "desc"),
                limit(5)
            );

            const recentLogsSnap =
                await getDocs(logsQuery);

            const logs = [];

            recentLogsSnap.forEach((doc) => {
                logs.push(doc.data());
            });

            setRecentLogs(logs);
            setActivityCount(logsSnap.size);
        } catch (err) {
            console.error("TeacherDashboard: Error loading stats:", err);
        } finally {
            setLoading(false);
        }
        };

        fetchStats();

    }, []);

    const getBadge = (xp) => {

        if (xp >= 200)
            return "🥇 Expert Reader";

        if (xp >= 100)
            return "🥈 Skilled Reader";

        if (xp >= 50)
            return "🥉 Beginner Reader";

        return "No Badge";
    };

    const formatLog = (action) => {

        if (!action) return "Activity";

        if (action.includes("teacherAccess changed to true"))
            return "✅ Teacher access granted";

        if (action.includes("teacherAccess changed to false"))
            return "❌ Teacher access revoked";

        if (action.includes("Teacher downloaded report"))
            return "📄 Teacher downloaded student report";

        if (action.includes("Guardian PIN"))
            return "🔒 Guardian PIN verified";

        if (action.includes("Assessment"))
            return "🤖 AI Assessment completed";

        return action;
    };

    const verifyTeacherPin = async () => {

        try {

            const studentDoc = await getDoc(
                doc(
                    db,
                    "users",
                    selectedStudent.id
                )
            );

            if (!studentDoc.exists()) {

                toast.error(
                    "Student not found"
                );

                return;
            }

            const studentData =
                studentDoc.data();

            if (
                enteredPin ===
                studentData.guardianPin
            ) {

                toast.success(
                    "PIN Verified"
                );

                setShowPinModal(false);
                setEnteredPin("");
                await addDoc(
                    collection(db, "activityLogs"),
                    {
                        action:
                            `Teacher downloaded report of ${selectedStudent.name}`,

                        timestamp:
                            new Date()
                    }
                );

                generateReportPDF({

                    name: selectedStudent?.name,

                    studentEmail: selectedStudent?.email,

                    parentEmail:
                        selectedStudent?.parentEmail,

                    score:
                        selectedStudent?.lastScore || 0,

                    total: 10,

                    accuracy:
                        selectedStudent?.lastAccuracy || 0,

                    confidence: Math.min(
                        95,
                        Math.max(
                            60,
                            (selectedStudent?.lastAccuracy || 0) + 10
                        )
                    ),

                    risk:
                        selectedStudent?.lastRisk ||
                        "Not Assessed",

                    xp:
                        selectedStudent?.xp || 0,

                    streak:
                        selectedStudent?.streak || 0,

                    badge: getBadge(
                        selectedStudent?.xp || 0
                    ),

                    recommendation:
                        selectedStudent.lastRisk === "High Risk"
                            ? "Immediate reading support and structured intervention recommended."
                            : selectedStudent.lastRisk === "Moderate Risk"
                                ? "Regular reading and pronunciation practice recommended."
                                : "Continue current learning activities and reading habits."
                });

            } else {

                toast.error(
                    "Incorrect Guardian PIN"
                );
            }

        } catch (error) {

            toast.error(
                "Verification Failed"
            );

            console.log(error);
        }
    };
    if (loading) {

        return (

            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900">

                <div className="text-center">

                    <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>

                    <h2 className="text-white text-xl font-semibold">
                        Loading Teacher Dashboard...
                    </h2>

                </div>

            </div>

        );
    }
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 text-white p-8">

            <div className="flex justify-between items-center mb-10">

                <h1 className="text-5xl font-bold">
                    👨‍🏫 Teacher Dashboard
                </h1>

                <button
                    onClick={handleLogout}
                    className="px-5 py-3 rounded-xl bg-red-500/20 border border-red-400/30"
                >
                    Logout
                </button>

            </div>

            <div className="grid md:grid-cols-3 gap-6">

                <div className="backdrop-blur-2xl bg-white/10 border border-white/10 rounded-3xl p-6">
                    <p className="text-gray-400">
                        Total Students
                    </p>

                    <h2 className="text-5xl font-bold mt-3">
                        {totalStudents}
                    </h2>
                </div>

                <div className="backdrop-blur-2xl bg-white/10 border border-white/10 rounded-3xl p-6">
                    <p className="text-gray-400">
                        Students Shared With Teacher
                    </p>

                    <h2 className="text-5xl font-bold mt-3">
                        {sharedReports}
                    </h2>
                </div>

                <div className="backdrop-blur-2xl bg-white/10 border border-white/10 rounded-3xl p-6">
                    <p className="text-gray-400">
                        Activity Logs
                    </p>

                    <h2 className="text-5xl font-bold mt-3">
                        {activityCount}
                    </h2>
                </div>

            </div>
            <div className="backdrop-blur-2xl bg-white/10 border border-white/10 rounded-3xl p-8 mt-8">

                <h2 className="text-2xl font-bold mb-6">
                    📜 Recent Activity Logs
                </h2>

                <div className="space-y-3">

                    {recentLogs.map((log, index) => (

                        <div
                            key={index}
                            className="bg-white/5 hover:bg-white/10 transition-all rounded-xl p-4 flex justify-between items-center"
                        >

                            <span>
                                {formatLog(log.action)}
                            </span>

                            <span className="text-gray-400 text-sm">
                                {log.timestamp?.toDate?.().toLocaleString()}
                            </span>

                        </div>

                    ))}

                </div>

            </div>
            <div className="backdrop-blur-2xl bg-white/10 border border-white/10 rounded-3xl p-8 mt-8">

                <h2 className="text-2xl font-bold mb-6">
                    👨‍🎓 Students Shared With Teacher
                </h2>

                <div className="space-y-4">

                    {teacherStudents.map((student) => (

                        <div
                            key={student.id}
                            className="bg-white/5 rounded-2xl p-5"
                        >

                            <h3 className="text-xl font-bold">
                                {student.name}
                            </h3>

                            <p className="text-gray-400">
                                {student.email}
                            </p>
                            <div className="grid md:grid-cols-4 gap-4 mt-4">

                                <div>
                                    🔥 Streak: {student.streak || 0}
                                </div>

                                <div>
                                    🏆 {getBadge(student.xp || 0)}
                                </div>

                                <div>
                                    {
                                        student.lastRisk === "Low Risk" ? (
                                            <span className="text-green-400 font-bold">
                                                🟢 Low Risk
                                            </span>
                                        ) : student.lastRisk === "Moderate Risk" ? (
                                            <span className="text-yellow-400 font-bold">
                                                🟠 Moderate Risk
                                            </span>
                                        ) : student.lastRisk === "High Risk" ? (
                                            <span className="text-red-400 font-bold">
                                                🔴 High Risk
                                            </span>
                                        ) : (
                                            <span>
                                                Not Assessed
                                            </span>
                                        )
                                    }
                                </div>

                                <div>
                                    {
                                        student.lastAssessmentDate
                                            ? new Date(
                                                student.lastAssessmentDate
                                            ).toLocaleDateString()
                                            : "No Assessment"
                                    }
                                </div>

                            </div>

                            <div className="flex flex-wrap gap-3 mt-4">
                                <button
                                    onClick={() =>
                                        setSelectedStudent(student)
                                    }
                                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-pink-400 text-black font-bold"
                                >
                                    📄 View Report
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveHistoryStudent(student);
                                        const el = document.getElementById("student-history-section");
                                        if (el) el.scrollIntoView({ behavior: "smooth" });
                                    }}
                                    className="px-5 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold hover:bg-cyan-500/30 transition-all flex items-center gap-2"
                                >
                                    📈 View History & Progress
                                </button>
                            </div>

                        </div>

                    ))}

                </div>

            </div>

            {/* Historical Assessment & Progress Section for Authorized Students */}
            <div id="student-history-section" className="mt-8">
                {teacherStudents.length > 0 ? (
                    <div className="space-y-4">
                        {/* Student Selector Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-xl">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    🎓 Student Progress Tracker
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Viewing historical assessments for students who granted teacherAccess consent.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label htmlFor="teacher-student-select" className="text-xs text-slate-300 font-medium">
                                    Selected Student:
                                </label>
                                <select
                                    id="teacher-student-select"
                                    value={activeHistoryStudent?.id || ""}
                                    onChange={(e) => {
                                        const found = teacherStudents.find((s) => s.id === e.target.value);
                                        if (found) setActiveHistoryStudent(found);
                                    }}
                                    className="px-3 py-2 rounded-xl bg-slate-800 border border-white/15 text-white text-sm focus:outline-none focus:border-cyan-400"
                                >
                                    {teacherStudents.map((s) => (
                                        <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                                            {s.name} ({s.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {activeHistoryStudent && (
                            <StudentAssessmentHistory
                                userId={activeHistoryStudent.id}
                                viewerRole="teacher"
                                studentName={activeHistoryStudent.name}
                            />
                        )}
                    </div>
                ) : (
                    <div className="p-8 rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl text-center space-y-3">
                        <p className="text-slate-400 text-sm">
                            No students have granted teacher access yet. Once a student enables &quot;Share with Teachers&quot; in their privacy settings, their longitudinal assessment history will appear here.
                        </p>
                    </div>
                )}
            </div>
            {selectedStudent && (

                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">

                    <div className="bg-slate-900 p-8 rounded-3xl w-[600px]">

                        <h2 className="text-3xl font-bold mb-6">
                            📄 Student Report
                        </h2>

                        <div className="space-y-3">

                            <p>
                                👤 Name:
                                {" "}
                                {selectedStudent.name}
                            </p>

                            <p>
                                📧 Email:
                                {" "}
                                {selectedStudent.email}
                            </p>

                            <p>
                                🎯 Accuracy:
                                {" "}
                                {selectedStudent.lastAccuracy || 0}%
                            </p>

                            <p>
                                🧠 Risk:
                                {" "}
                                {selectedStudent.lastRisk ||
                                    "Not Assessed"}
                            </p>

                            <p>
                                🔥 Streak:
                                {" "}
                                {selectedStudent.streak || 0}
                            </p>

                            <p>
                                ⭐ XP:
                                {" "}
                                {selectedStudent.xp || 0}
                            </p>
                            <p>
                                🔤 Letter Score:
                                {" "}
                                {selectedStudent.letterScore || 0}/7
                            </p>

                            <p>
                                📝 Word Score:
                                {" "}
                                {selectedStudent.wordScore || 0}/7
                            </p>

                            <p>
                                🤖 Model:
                                Logistic Regression
                            </p>

                            <p>
                                🎯 Model Accuracy:
                                98.5%
                            </p>
                        </div>
                        <button
                            onClick={() =>
                                setShowPinModal(true)
                            }
                            className="mt-6 mr-3 px-6 py-3 rounded-xl bg-green-500 text-black font-bold"
                        >
                            📄 Download PDF
                        </button>
                        <button
                            onClick={() =>
                                setSelectedStudent(null)
                            }
                            className="mt-6 px-6 py-3 rounded-xl bg-red-500"
                        >
                            Close
                        </button>

                    </div>

                </div>

            )}
            {showPinModal && (

                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">

                    <div className="bg-slate-900 p-8 rounded-3xl w-[400px]">

                        <h2 className="text-2xl font-bold mb-4">
                            🔒 Guardian PIN Required
                        </h2>

                        <p className="text-gray-400 mb-5">
                            Enter Guardian PIN to download report
                        </p>

                        <input
                            type="password"
                            maxLength="4"
                            value={enteredPin}
                            onChange={(e) =>
                                setEnteredPin(
                                    e.target.value
                                )
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    verifyTeacherPin();
                                }
                            }}
                            className="w-full p-4 rounded-xl bg-white/10 border border-white/10 text-white"
                        />

                        <button
                            onClick={verifyTeacherPin}
                            className="w-full mt-5 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-pink-400 text-black font-bold"
                        >
                            Verify PIN
                        </button>

                    </div>

                </div>

            )}
        </div>
    );
}