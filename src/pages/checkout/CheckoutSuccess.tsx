import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Loader2, Coins, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';

export function CheckoutSuccess() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<'loading' | 'approved' | 'pending' | 'failed'>('loading');
    const [koinsData, setKoinsData] = useState<{ koins_credited?: number; koins_balance?: number; amount?: number } | null>(null);
    const verifiedRef = useRef(false);
    const apiBase = 'http://127.0.0.1:3000';

    // Mercado Pago redirects with these query params:
    // ?collection_id=PAYMENT_ID&collection_status=approved&payment_id=PAYMENT_ID&status=approved&...
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
    const mpStatus = searchParams.get('status') || searchParams.get('collection_status');

    useEffect(() => {
        if (verifiedRef.current) return;
        verifiedRef.current = true;

        const verifyPayment = async () => {
            if (!paymentId) {
                setStatus('failed');
                return;
            }

            // If MP already tells us it's not approved
            if (mpStatus && mpStatus !== 'approved') {
                setStatus(mpStatus === 'pending' || mpStatus === 'in_process' ? 'pending' : 'failed');
                return;
            }

            try {
                const token = localStorage.getItem('kogna_token');
                const response = await fetch(`${apiBase}/api/payments/verify/${paymentId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                const data = await response.json();


                if (data.status === 'approved') {
                    setStatus('approved');
                    setKoinsData(data);
                } else if (data.status === 'pending' || data.status === 'in_process') {
                    setStatus('pending');
                } else {
                    setStatus('failed');
                }
            } catch (err) {
                console.error('[CHECKOUT-SUCCESS] Verification error:', err);
                // If verification fails but MP said approved, still show success
                if (mpStatus === 'approved') {
                    setStatus('approved');
                } else {
                    setStatus('failed');
                }
            }
        };

        verifyPayment();
    }, [paymentId, mpStatus]);

    // Big Win Effect
    useEffect(() => {
        if (status === 'approved') {
            // Sound
            const audio = new Audio('/sounds/coins.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => { });

            // Confetti
            const duration = 3000;
            const end = Date.now() + duration;

            const frame = () => {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#FFD700', '#FFA500', '#FF4500']
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#FFD700', '#FFA500', '#FF4500']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            };
            frame();
        }
    }, [status]);

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6">
            <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-6">

                {status === 'loading' && (
                    <>
                        <Loader2 className="w-16 h-16 text-primary mx-auto animate-spin" />
                        <h1 className="text-2xl font-bold text-text-primary">Verificando pagamento...</h1>
                        <p className="text-text-secondary">Aguarde enquanto confirmamos seu pagamento.</p>
                    </>
                )}

                {status === 'approved' && (
                    <>
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle className="w-12 h-12 text-green-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-text-primary">Pagamento Aprovado! 🎉</h1>

                        {koinsData && (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
                                <div className="flex items-center justify-center gap-2 text-green-400">
                                    <Coins className="w-5 h-5" />
                                    <span className="font-bold text-lg">+{koinsData.koins_credited} Koins</span>
                                </div>
                                {koinsData.amount && (
                                    <p className="text-sm text-text-secondary">
                                        Pagamento de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(koinsData.amount)}
                                    </p>
                                )}
                                <p className="text-sm text-text-muted">
                                    Saldo atual: <span className="font-semibold text-text-primary">{koinsData.koins_balance} Koins</span>
                                </p>
                            </div>
                        )}

                        <p className="text-text-secondary">Seus Koins já estão disponíveis para uso!</p>

                        <button
                            onClick={() => navigate('/')}
                            className="w-full py-4 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-black text-xl rounded-xl transition-all shadow-lg hover:shadow-orange-500/40 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 group relative overflow-hidden animate-pulse-slow"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                VER MEU NOVO SALDO <Zap className="w-5 h-5 fill-current" />
                            </span>
                        </button>
                    </>
                )}

                {status === 'pending' && (
                    <>
                        <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto">
                            <Clock className="w-12 h-12 text-yellow-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-text-primary">Pagamento Pendente</h1>
                        <p className="text-text-secondary">
                            Seu pagamento está sendo processado. Os Koins serão creditados assim que o pagamento for confirmado.
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-colors"
                        >
                            Ir para o Dashboard
                        </button>
                    </>
                )}

                {status === 'failed' && (
                    <>
                        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                            <XCircle className="w-12 h-12 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-text-primary">Pagamento Não Concluído</h1>
                        <p className="text-text-secondary">
                            Seu pagamento não foi aprovado. Tente novamente ou use outro meio de pagamento.
                        </p>
                        <button
                            onClick={() => navigate(-1)}
                            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
                        >
                            Tentar Novamente
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
