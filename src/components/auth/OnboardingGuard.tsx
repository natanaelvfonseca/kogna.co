import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

interface OnboardingGuardProps {
    children: React.ReactNode;
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
    const { user, token } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [shouldRedirect, setShouldRedirect] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {


            if (!user || !token) {

                setIsLoading(false);
                return;
            }

            try {
                // Hardcoded API URL for consistency with other components
                const API_URL = '/api';
                const res = await fetch(`${API_URL}/onboarding/status`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (res.ok) {
                    const data = await res.json();


                    // If onboarding is NOT completed, we should redirect to /onboarding
                    if (!data.completed) {

                        setShouldRedirect(true);
                    } else {

                    }
                } else {
                    console.error('OnboardingGuard: API Check failed', res.status);
                }
            } catch (error) {
                console.error('Failed to check onboarding status:', error);
            } finally {
                setIsLoading(false);
            }
        };

        checkStatus();
    }, [user, token]);

    if (isLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (shouldRedirect) {
        return <Navigate to="/onboarding" replace />;
    }

    return <>{children}</>;
}
