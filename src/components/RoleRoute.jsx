import ProtectedRoute from "./ProtectedRoute";

export default function RoleRoute({ children, allowedRoles }) {
    return (
        <ProtectedRoute allowedRoles={allowedRoles}>
            {children}
        </ProtectedRoute>
    );
}

export { RoleRoute };

