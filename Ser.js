// App.js or wherever you handle authentication
import React, { useState } from 'react';
import Login from './Login'; // Your login component
import ClientDashboard from './ClientDashboard'; // Your client dashboard component

function App() {
    const [user, setUser] = useState(null); // State to store user data

    // Function to handle successful login
    const handleLogin = (userData) => {
        setUser(userData); // Set user data in state upon successful login
    };

    return (
        <div>
            {/* Conditional rendering based on user authentication */}
            {user ? (
                <ClientDashboard user={user} /> // Pass user data to client dashboard
            ) : (
                <Login onLogin={handleLogin} /> // Pass login handler function to login component
            )}
        </div>
    );
}

export default App;
