import Signup from "./pages/Signup";
import { Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import AboutDyslexia from "./components/AboutDyslexia";
import WhyDyslexAid from "./components/WhyDyslexAid";
import HowItWorks from "./components/HowItWorks";
import DashboardPreview from "./components/DashboardPreview";
import ImpactStats from "./components/ImpactStats";
import AIScreening from "./pages/AIScreening";
import Footer from "./components/Footer";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import Practice from "./pages/Practice";
import Login from "./pages/Login";
import Assessment from "./pages/Assessment";
import LetterRecognition from "./pages/LetterRecognition";
import WordMatching from "./pages/WordMatching";
import ScreeningTest from "./pages/ScreeningTest";
import AIReport from "./pages/AIReport";
import { Toaster } from "react-hot-toast";
import GuardianPin from "./pages/GuardianPin";
import TeacherDashboard from "./pages/TeacherDashboard";
import ParentDashboard from "./pages/ParentDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import PendingApproval from "./pages/PendingApproval";
import AccountRejected from "./pages/AccountRejected";
import AccountSuspended from "./pages/AccountSuspended";
import ScreeningVoice from "./pages/ScreeningVoice";
import ScreeningLetter from "./pages/ScreeningLetter";
import ScreeningWord from "./pages/ScreeningWord";
import NotFound from "./pages/NotFound";
import ScreeningLayout from "./layouts/ScreeningLayout";

function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <AboutDyslexia />
      <WhyDyslexAid />
      <HowItWorks />
      <Features />
      <DashboardPreview />
      <ImpactStats />
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 text-white overflow-hidden relative">

      <div className="absolute top-0 left-0 w-96 h-96 bg-cyan-500/20 blur-3xl rounded-full"></div>

      <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500/20 blur-3xl rounded-full"></div>
      <>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 1500,
            style: {
              fontSize: "18px",
              padding: "20px",
              minWidth: "450px",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(20px)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.15)",
            },
            success: {
              style: {
                border: "1px solid #22c55e",
              },
            },
            error: {
              style: {
                border: "1px solid #ef4444",
              },
            },
          }}
        />

        {/* Routes */}
      </>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route path="/account-rejected" element={<AccountRejected />} />
        <Route path="/account-suspended" element={<AccountSuspended />} />

        {/* Student Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/practice"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <Practice />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assessment"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <Assessment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/letter-recognition"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <LetterRecognition />
            </ProtectedRoute>
          }
        />
        <Route
          path="/word-matching"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <WordMatching />
            </ProtectedRoute>
          }
        />
        <Route
          path="/screening-test"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <ScreeningTest />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-report"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <AIReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guardian-pin"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <GuardianPin />
            </ProtectedRoute>
          }
        />

        <Route
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <ScreeningLayout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/ai-screening"
            element={<AIScreening />}
          />
          <Route
            path="/screening-voice"
            element={<ScreeningVoice />}
          />
          <Route
            path="/screening-letter"
            element={<ScreeningLetter />}
          />
          <Route
            path="/screening-word"
            element={<ScreeningWord />}
          />
        </Route>

        {/* Teacher Protected Route */}
        <Route
          path="/teacher-dashboard"
          element={
            <ProtectedRoute allowedRoles={["teacher"]}>
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />

        {/* Parent Protected Route */}
        <Route
          path="/parent-dashboard"
          element={
            <ProtectedRoute allowedRoles={["parent"]}>
              <ParentDashboard />
            </ProtectedRoute>
          }
        />

        {/* Super Admin Protected Route */}
        <Route
          path="/admin-dashboard"
          element={
            <AdminRoute>
              <SuperAdminDashboard />
            </AdminRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}