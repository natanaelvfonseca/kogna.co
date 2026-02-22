import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../../config/api';

export function ReferralRedirect() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();

    useEffect(() => {
        const processReferral = async () => {
            if (!code) {
                navigate('/register', { replace: true });
                return;
            }

            // 1. Save locally so the registration form can pick it up
            localStorage.setItem('kogna_affiliate_data', JSON.stringify({
                code: code,
                timestamp: Date.now()
            }));

            // 2. Track the click on the backend (fire and forget)
            try {
                await fetch(`${API_URL}/partners/click`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ affiliateCode: code })
                });
            } catch (err) {
                console.error("Failed to register affiliate click", err);
            }

            // 3. Immediately redirect to register
            navigate('/register', { replace: true });
        };

        processReferral();
    }, [code, navigate]);

    // Show a minimal loading state while redirecting
    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-text-secondary">Redirecionando...</p>
            </div>
        </div>
    );
}
