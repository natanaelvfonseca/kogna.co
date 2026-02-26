import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2, CreditCard, QrCode, ShieldCheck, CheckCircle, Copy, AlertCircle, Bug, Sparkles, Gift, Zap } from 'lucide-react';
import { DebugModal, DebugLog } from '../../components/DebugModal';

declare global {
    interface Window {
        MercadoPago: any;
    }
}

type PaymentMethod = 'credit_card' | 'pix';
type PaymentStatus = 'idle' | 'processing' | 'approved' | 'rejected' | 'pending';

export function Checkout() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const productId = searchParams.get('productId');

    const [loading, setLoading] = useState(true);
    const [product, setProduct] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
    const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
    const [paymentResult, setPaymentResult] = useState<any>(null);
    const [mpReady, setMpReady] = useState(false);
    const mpRef = useRef<any>(null);
    const fetchedRef = useRef(false);
    const apiBase = '';

    // Card form state
    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCVV, setCardCVV] = useState('');
    const [cardHolder, setCardHolder] = useState('');
    const [docNumber, setDocNumber] = useState('');
    const [installments, setInstallments] = useState(1);
    const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
    const [paymentMethodId, setPaymentMethodId] = useState<string>('');

    // Debug State
    const [debugOpen, setDebugOpen] = useState(false);
    const [logs, setLogs] = useState<DebugLog[]>([]);


    // Bonus Logic
    const getBonusAmount = (pid: string) => {
        if (!pid) return 0;
        if (pid.includes('trial')) return 0;
        if (pid.includes('start')) return 1000;
        if (pid.includes('growth')) return 5000;
        if (pid.includes('elite')) return 15000;
        return 0;
    };

    const bonusAmount = product ? getBonusAmount(productId || product.id) : 0;

    const addLog = (type: DebugLog['type'], message: string, details?: any) => {
        const newLog = {
            timestamp: new Date().toLocaleTimeString(),
            type,
            message,
            details
        };
        setLogs(prev => [newLog, ...prev]);

    };

    // PIX state
    const [pixQrCode, setPixQrCode] = useState<string | null>(null);
    const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
    const [pixCopied, setPixCopied] = useState(false);

    // Load MercadoPago.js SDK
    useEffect(() => {
        const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY;
        if (!publicKey) {
            console.error('[CHECKOUT] VITE_MERCADOPAGO_PUBLIC_KEY not set');
            return;
        }

        // Check if SDK already loaded
        if (window.MercadoPago) {
            mpRef.current = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
            setMpReady(true);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://sdk.mercadopago.com/js/v2';
        script.async = true;
        script.onload = () => {
            mpRef.current = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
            setMpReady(true);
        };
        document.body.appendChild(script);

        return () => {
            // Don't remove script on unmount as it should persist
        };
    }, []);

    // Fetch product data
    useEffect(() => {
        if (fetchedRef.current) return;
        if (!user) return;
        fetchedRef.current = true;

        const fetchProduct = async () => {
            try {
                if (productId) {
                    addLog('info', `Buscando produto: ${productId}`);
                    const res = await fetch(`${apiBase}/api/public/products/${productId}`);
                    if (!res.ok) {
                        addLog('error', `Erro ao buscar produto: ${res.status} ${res.statusText}`);
                        throw new Error('Produto não encontrado');
                    }
                    const data = await res.json();
                    addLog('success', 'Produto carregado', data);
                    setProduct(data);
                } else {
                    addLog('info', 'Nenhum produto especificado, carregando padrão');
                    setProduct({
                        id: 'plan_pro',
                        name: 'Plano Pro - Assinatura Mensal',
                        description: 'Acesso completo a todos os recursos',
                        price: 197.00
                    });
                }
            } catch (err: any) {
                addLog('error', 'Exceção ao carregar produto', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchProduct();
    }, [user, productId]);

    // Format card number with spaces
    const formatCardNumber = (value: string) => {
        const nums = value.replace(/\D/g, '').slice(0, 16);
        return nums.replace(/(\d{4})(?=\d)/g, '$1 ');
    };

    // Format expiry MM/YY
    const formatExpiry = (value: string) => {
        const nums = value.replace(/\D/g, '').slice(0, 4);
        if (nums.length >= 3) return nums.slice(0, 2) + '/' + nums.slice(2);
        return nums;
    };

    // Format CPF
    const formatCPF = (value: string) => {
        const nums = value.replace(/\D/g, '').slice(0, 11);
        if (nums.length <= 3) return nums;
        if (nums.length <= 6) return nums.slice(0, 3) + '.' + nums.slice(3);
        if (nums.length <= 9) return nums.slice(0, 3) + '.' + nums.slice(3, 6) + '.' + nums.slice(6);
        return nums.slice(0, 3) + '.' + nums.slice(3, 6) + '.' + nums.slice(6, 9) + '-' + nums.slice(9);
    };

    // Identify payment method (brand) based on BIN
    useEffect(() => {
        if (!mpRef.current || cardNumber.replace(/\s/g, '').length < 6) return;

        const bin = cardNumber.replace(/\s/g, '').substring(0, 6);

        mpRef.current.getPaymentMethods({ bin })
            .then((result: any) => {
                const { results } = result;
                if (results && results.length > 0) {
                    setPaymentMethodId(results[0].id);
                    // If we needed issuer, we would fetch it here too, but for simple checkout usually brand is enough

                }
            })
            .catch((err: any) => console.error('[CHECKOUT] Error getting payment method:', err));
    }, [cardNumber, mpReady]);

    // Process credit card payment
    const handleCardPayment = useCallback(async () => {
        addLog('info', 'Iniciando pagamento via Cartão de Crédito...');
        if (!mpRef.current || !product) {
            addLog('error', 'MercadoPago SDK ou Produto indisponível', { mpReady: !!mpRef.current, product: !!product });
            return;
        }

        // Validate
        const errors: Record<string, string> = {};
        const cleanCard = cardNumber.replace(/\s/g, '');
        if (cleanCard.length < 13) errors.cardNumber = 'Número do cartão inválido';
        if (cardExpiry.length < 5) errors.cardExpiry = 'Data inválida';
        if (cardCVV.length < 3) errors.cardCVV = 'CVV inválido';
        if (!cardHolder.trim()) errors.cardHolder = 'Nome obrigatório';
        if (docNumber.replace(/\D/g, '').length < 11) errors.docNumber = 'CPF inválido';

        if (Object.keys(errors).length > 0) {
            addLog('warning', 'Erros de validação no formulário', errors);
            setCardErrors(errors);
            return;
        }
        setCardErrors({});
        setPaymentStatus('processing');
        setError(null);

        try {
            const [expMonth, expYear] = cardExpiry.split('/');

            // Handle year format (YY vs YYYY)
            const yearStr = expYear.length === 2 ? '20' + expYear : expYear;

            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;
            const expYearNum = parseInt(yearStr);
            const expMonthNum = parseInt(expMonth);

            if (expYearNum < currentYear || (expYearNum === currentYear && expMonthNum < currentMonth)) {
                console.error('[CHECKOUT] Card expired');
                setCardErrors({ ...cardErrors, cardExpiry: 'Cartão vencido' });
                setPaymentStatus('rejected');
                return;
            }

            if (expMonthNum < 1 || expMonthNum > 12) {
                console.error('[CHECKOUT] Invalid month');
                setCardErrors({ ...cardErrors, cardExpiry: 'Mês inválido' });
                setPaymentStatus('rejected');
                return;
            }

            // Step 1: Create card token using MercadoPago.js
            const tokenResponse = await mpRef.current.createCardToken({
                cardNumber: cleanCard,
                cardholderName: cardHolder,
                cardExpirationMonth: expMonth,
                cardExpirationYear: yearStr,
                securityCode: cardCVV,
                identificationType: 'CPF',
                identificationNumber: docNumber.replace(/\D/g, '')
            });

            if (!tokenResponse.id) {
                // Handle different error structures from SDK
                const errorMessage = tokenResponse.cause?.[0]?.description || tokenResponse.message || 'Erro ao validar cartão';
                addLog('error', 'Falha ao criar token do cartão', tokenResponse);
                throw new Error(errorMessage);
            }
            addLog('success', 'Token do cartão criado com sucesso', { tokenId: tokenResponse.id });

            // Step 2: Send payment to backend
            const paymentData = {
                transaction_amount: Number(product.price),
                token: tokenResponse.id,
                description: product.name,
                installments: installments,
                payment_method_id: paymentMethodId || tokenResponse.payment_method_id, // Use identified method or fallback
                payer: {
                    email: user?.email || 'test@test.com',
                    identification: {
                        type: 'CPF',
                        number: docNumber.replace(/\D/g, '')
                    }
                },
                external_reference: user?.id || 'anonymous',
                metadata: {
                    product_id: product.id
                }
            };

            if (!paymentData.payment_method_id) {
                throw new Error('Bandeira do cartão não identificada. Verifique o número.');
            }

            const response = await fetch(`${apiBase}/api/payments/process-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('kogna_token')}`
                },
                body: JSON.stringify(paymentData)
            });

            const result = await response.json();

            addLog('info', 'Resposta do processamento de pagamento', result);

            setPaymentResult(result);

            if (result.status === 'approved') {
                setPaymentStatus('approved');
                // Verify and credit Koins
                try {
                    await fetch(`${apiBase}/api/payments/verify/${result.id}`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('kogna_token')}` }
                    });
                    addLog('success', 'Pagamento aprovado e verificado!');
                } catch (e) { /* verification is best-effort, IPN will handle it */ }
            } else if (result.status === 'in_process' || result.status === 'pending') {
                setPaymentStatus('pending');
            } else {
                setPaymentStatus('rejected');
                if (result.error || result.message) {
                    setError(result.error || result.message);
                }
            }

        } catch (err: any) {
            console.error('[CHECKOUT] Payment error:', err);
            addLog('error', 'Erro durante o processamento do pagamento', err);
            setPaymentStatus('rejected');
            setPaymentResult({ error: err.message || 'Erro ao processar pagamento' });
            setError(err.message || 'Ocorreu um erro ao processar o pagamento via cartão.');
        }
    }, [product, cardNumber, cardExpiry, cardCVV, cardHolder, docNumber, installments, user, paymentMethodId]);

    // Process PIX payment
    const handlePixPayment = useCallback(async () => {
        addLog('info', 'Iniciando pagamento via PIX...');
        if (!product) {
            addLog('error', 'Produto indisponível para PIX');
            return;
        }
        setPaymentStatus('processing');

        try {
            const paymentData = {
                transaction_amount: Number(product.price),
                description: product.name,
                payment_method_id: 'pix',
                payer: {
                    email: user?.email || 'test@test.com',
                    identification: {
                        type: 'CPF',
                        number: docNumber.replace(/\D/g, '') || '12345678909'
                    }
                },
                external_reference: user?.id || 'anonymous',
                metadata: {
                    product_id: product.id
                }
            };

            const response = await fetch(`${apiBase}/api/payments/process-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('kogna_token')}`
                },
                body: JSON.stringify(paymentData)
            });

            const result = await response.json();

            addLog('info', 'Resultado da criação do PIX', result);

            if (result.point_of_interaction?.transaction_data) {
                setPixQrCode(result.point_of_interaction.transaction_data.qr_code_base64);
                setPixCopyPaste(result.point_of_interaction.transaction_data.qr_code);
                setPaymentStatus('pending');
                setPaymentResult(result);
            } else if (result.mpError?.point_of_interaction) {
                setPixQrCode(result.mpError.point_of_interaction.transaction_data.qr_code_base64);
                setPixCopyPaste(result.mpError.point_of_interaction.transaction_data.qr_code);
                setPaymentStatus('pending');
                setPaymentResult(result);
            } else {
                setPaymentResult(result);
                setPaymentStatus('rejected');
            }

        } catch (err: any) {
            console.error('[CHECKOUT] PIX error:', err);
            addLog('error', 'Erro ao processar pagamento PIX', err);
            setPaymentStatus('rejected');
            setPaymentResult({ error: err.message });
        }
    }, [product, user, docNumber]);

    // Polling for PIX payment status
    useEffect(() => {
        let interval: any;

        if (paymentStatus === 'pending' && paymentResult?.id) {
            addLog('info', `Iniciando monitoramento do pagamento: ${paymentResult.id}`);

            interval = setInterval(async () => {
                try {
                    const response = await fetch(`${apiBase}/api/payments/verify/${paymentResult.id}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('kogna_token')}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        addLog('info', `Status do pagamento ${paymentResult.id}: ${data.status}`);
                        if (data.status === 'approved') {
                            addLog('success', 'Pagamento aprovado via polling!');
                            setPaymentStatus('approved');
                            clearInterval(interval);
                        }
                    } else {
                        addLog('error', `Erro no polling: ${response.status}`);
                    }
                } catch (err) {
                    console.error('[CHECKOUT] Polling error:', err);
                }
            }, 5000); // Check every 5 seconds
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [paymentStatus, paymentResult, addLog]);

    const copyPixCode = () => {
        if (pixCopyPaste) {
            navigator.clipboard.writeText(pixCopyPaste);
            setPixCopied(true);
            setTimeout(() => setPixCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center relative">
                <Loader2 className="animate-spin text-primary w-10 h-10" />
                <button
                    onClick={() => setDebugOpen(true)}
                    className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow-lg"
                >
                    <Bug size={16} />
                    Debug Info
                </button>
                <DebugModal isOpen={debugOpen} onClose={() => setDebugOpen(false)} logs={logs} title="Checkout Debug (Loading)" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6 relative">
                <div className="bg-red-500/10 text-red-500 p-6 rounded-xl border border-red-500/20 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3" />
                    <h3 className="font-bold text-lg mb-2">Erro no Checkout</h3>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
                        Tentar Novamente
                    </button>
                </div>
                <button
                    onClick={() => setDebugOpen(true)}
                    className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow-lg"
                >
                    <Bug size={16} />
                    Debug Info
                </button>
                <DebugModal isOpen={debugOpen} onClose={() => setDebugOpen(false)} logs={logs} title="Checkout Debug (Error)" />
            </div>
        );
    }

    // Success State
    if (paymentStatus === 'approved') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-6 relative">
                <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-5">
                    <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle className="w-12 h-12 text-green-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-text-primary">Pagamento Aprovado! 🎉</h1>
                    <p className="text-text-secondary">
                        Seu pagamento de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product?.price || 0)} foi processado com sucesso.
                    </p>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                        <p className="text-green-400 font-semibold">Koins serão creditados automaticamente!</p>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors"
                    >
                        Ir para o Dashboard
                    </button>
                </div>
                <button
                    onClick={() => setDebugOpen(true)}
                    className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow-lg"
                >
                    <Bug size={16} />
                    Debug Info
                </button>
                <DebugModal isOpen={debugOpen} onClose={() => setDebugOpen(false)} logs={logs} title="Checkout Debug (Success)" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="text-center space-y-2 relative">
                    <h1 className="text-3xl font-bold text-text-primary">Finalizar Compra</h1>
                    <p className="text-text-secondary">Preencha os dados de pagamento</p>
                    <button
                        onClick={() => setDebugOpen(true)}
                        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-black/80 text-white rounded-full hover:bg-black transition-colors shadow-lg backdrop-blur-sm"
                    >
                        <Bug size={16} />
                        Debug Info
                    </button>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {/* Resumo */}
                    <div className="md:col-span-1 order-2 md:order-1 space-y-6">
                        {/* Resumo do Pedido */}
                        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <span className="w-1 h-6 bg-primary rounded-full"></span>
                                Resumo do Pedido
                            </h2>
                            {product && (
                                <>
                                    <div className="py-4 border-b border-gray-100 space-y-2">
                                        <h3 className="font-bold text-xl text-gray-900">{product.name}</h3>
                                        {product.description && (
                                            <p className="text-sm text-gray-500">{product.description}</p>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center py-4">
                                        <span className="font-medium text-gray-600">Total a pagar</span>
                                        <span className="font-bold text-3xl text-green-600">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
                                        <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
                                        <span>Pagamento 100% seguro e criptografado</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Componente de Vantagem Imediata */}
                        {bonusAmount > 0 && (
                            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group border border-gray-700">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/20 blur-[50px] rounded-full group-hover:bg-yellow-500/30 transition-all"></div>

                                <div className="relative z-10 space-y-3">
                                    <div className="flex items-center gap-2 text-yellow-400 mb-1">
                                        <Sparkles className="w-5 h-5 animate-pulse" />
                                        <span className="font-bold text-xs uppercase tracking-wider">Vantagem Imediata</span>
                                    </div>

                                    <h3 className="text-white font-medium">
                                        Ao confirmar agora, você recebe:
                                    </h3>

                                    <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl p-4 transform transition-transform group-hover:scale-105">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400">
                                                <Gift className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="text-yellow-400 font-bold text-lg drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                                                    +{bonusAmount.toLocaleString()} Koins Grátis
                                                </p>
                                                <p className="text-gray-400 text-xs">Incluídas neste pacote</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Formulário de Pagamento */}
                    <div className="md:col-span-2 order-1 md:order-2">
                        <div className="bg-surface border border-border rounded-xl p-6 space-y-6">

                            {/* Tabs de método de pagamento */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPaymentMethod('credit_card')}
                                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${paymentMethod === 'credit_card'
                                        ? 'bg-primary text-white shadow-md'
                                        : 'bg-background text-text-secondary hover:bg-muted border border-border'
                                        }`}
                                >
                                    <CreditCard className="w-5 h-5" />
                                    Cartão de Crédito
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('pix')}
                                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${paymentMethod === 'pix'
                                        ? 'bg-primary text-white shadow-md'
                                        : 'bg-background text-text-secondary hover:bg-muted border border-border'
                                        }`}
                                >
                                    <QrCode className="w-5 h-5" />
                                    PIX
                                </button>
                            </div>

                            {/* Cartão de Crédito */}
                            {paymentMethod === 'credit_card' && (
                                <div className="space-y-4">
                                    {/* Número do Cartão */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-primary mb-1.5">Número do Cartão</label>
                                        <input
                                            type="text"
                                            placeholder="0000 0000 0000 0000"
                                            value={cardNumber}
                                            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                                            className={`w-full px-4 py-3 bg-background border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${cardErrors.cardNumber ? 'border-red-500' : 'border-border'}`}
                                        />
                                        {paymentMethodId && (
                                            <div className="absolute right-4 top-[38px] text-green-500 text-xs font-bold uppercase">
                                                {paymentMethodId}
                                            </div>
                                        )}
                                        {cardErrors.cardNumber && <p className="text-red-500 text-xs mt-1">{cardErrors.cardNumber}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Validade */}
                                        <div>
                                            <label className="block text-sm font-medium text-text-primary mb-1.5">Validade</label>
                                            <input
                                                type="text"
                                                placeholder="MM/AA"
                                                value={cardExpiry}
                                                onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                                                className={`w-full px-4 py-3 bg-background border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${cardErrors.cardExpiry ? 'border-red-500' : 'border-border'}`}
                                            />
                                            {cardErrors.cardExpiry && <p className="text-red-500 text-xs mt-1">{cardErrors.cardExpiry}</p>}
                                        </div>
                                        {/* CVV */}
                                        <div>
                                            <label className="block text-sm font-medium text-text-primary mb-1.5">CVV</label>
                                            <input
                                                type="text"
                                                placeholder="123"
                                                value={cardCVV}
                                                onChange={(e) => setCardCVV(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                                className={`w-full px-4 py-3 bg-background border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${cardErrors.cardCVV ? 'border-red-500' : 'border-border'}`}
                                            />
                                            {cardErrors.cardCVV && <p className="text-red-500 text-xs mt-1">{cardErrors.cardCVV}</p>}
                                        </div>
                                    </div>

                                    {/* Nome no Cartão */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-primary mb-1.5">Nome no Cartão</label>
                                        <input
                                            type="text"
                                            placeholder="Como está no cartão"
                                            value={cardHolder}
                                            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                                            className={`w-full px-4 py-3 bg-background border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${cardErrors.cardHolder ? 'border-red-500' : 'border-border'}`}
                                        />
                                        {cardErrors.cardHolder && <p className="text-red-500 text-xs mt-1">{cardErrors.cardHolder}</p>}
                                    </div>

                                    {/* CPF */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-primary mb-1.5">CPF do Titular</label>
                                        <input
                                            type="text"
                                            placeholder="000.000.000-00"
                                            value={docNumber}
                                            onChange={(e) => setDocNumber(formatCPF(e.target.value))}
                                            className={`w-full px-4 py-3 bg-background border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${cardErrors.docNumber ? 'border-red-500' : 'border-border'}`}
                                        />
                                        {cardErrors.docNumber && <p className="text-red-500 text-xs mt-1">{cardErrors.docNumber}</p>}
                                    </div>

                                    {/* Parcelas */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-primary mb-1.5">Parcelas</label>
                                        <select
                                            value={installments}
                                            onChange={(e) => setInstallments(Number(e.target.value))}
                                            className="w-full px-4 py-3 bg-background border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                        >
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                                <option key={n} value={n}>
                                                    {n}x de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((product?.price || 0) / n)}
                                                    {n === 1 ? ' (à vista)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Rejected message */}
                                    {paymentStatus === 'rejected' && (
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                                            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="font-medium text-red-500">Pagamento recusado</p>
                                                <p className="text-sm text-text-secondary mt-1">
                                                    {paymentResult?.details || paymentResult?.error || 'Verifique os dados e tente novamente.'}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Botão Pagar - Visual de Elite */}
                                    <div className="space-y-4 pt-4">
                                        <button
                                            onClick={handleCardPayment}
                                            disabled={paymentStatus === 'processing' || !mpReady}
                                            className="w-full py-5 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-black text-xl rounded-xl transition-all shadow-lg hover:shadow-orange-500/40 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 group relative overflow-hidden"
                                        >
                                            {/* Pulse Effect */}
                                            <span className="absolute inset-0 w-full h-full bg-white/20 animate-[pulse_2s_infinite]"></span>

                                            {paymentStatus === 'processing' ? (
                                                <>
                                                    <Loader2 className="w-6 h-6 animate-spin relative z-10" />
                                                    <span className="relative z-10">PROCESSANDO...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Zap className="w-6 h-6 fill-current relative z-10" />
                                                    <span className="relative z-10 uppercase tracking-wide">POTENCIALIZAR MINHA EMPRESA</span>
                                                </>
                                            )}
                                        </button>

                                        {/* Trust Signals */}
                                        <div className="space-y-3">
                                            <p className="text-center text-sm text-gray-500 font-medium">
                                                Junte-se a <span className="text-gray-900 font-bold">+500 empresas</span> que já automatizaram suas vendas.
                                            </p>

                                            <div className="flex items-center justify-center gap-4">
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-full border border-green-100">
                                                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                                    <span className="text-xs font-semibold text-green-700">Aprovação Instantânea</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
                                                    <Zap className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                                                    <span className="text-xs font-semibold text-blue-700">Créditos liberados na hora</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* PIX */}
                            {paymentMethod === 'pix' && (
                                <div className="space-y-4">
                                    {paymentStatus === 'idle' || paymentStatus === 'rejected' ? (
                                        <>
                                            <div className="text-center space-y-3">
                                                <QrCode className="w-16 h-16 text-primary mx-auto opacity-50" />
                                                <p className="text-text-secondary">
                                                    O QR Code será gerado ao clicar no botão abaixo
                                                </p>
                                            </div>

                                            {/* CPF para PIX */}
                                            <div>
                                                <label className="block text-sm font-medium text-text-primary mb-1.5">CPF</label>
                                                <input
                                                    type="text"
                                                    placeholder="000.000.000-00"
                                                    value={docNumber}
                                                    onChange={(e) => setDocNumber(formatCPF(e.target.value))}
                                                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                                />
                                            </div>

                                            {paymentStatus === 'rejected' && (
                                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                                    <p className="text-red-500 text-sm">{paymentResult?.details || paymentResult?.error || 'Erro ao gerar PIX'}</p>
                                                </div>
                                            )}

                                            <button
                                                onClick={handlePixPayment}
                                                className="w-full py-4 bg-[#32BCAD] hover:bg-[#2aa69a] disabled:bg-gray-500 text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg"
                                            >
                                                <>
                                                    <QrCode className="w-5 h-5" />
                                                    Gerar QR Code PIX
                                                </>
                                            </button>
                                        </>
                                    ) : paymentStatus === 'pending' && pixQrCode ? (
                                        <div className="text-center space-y-4">
                                            <p className="font-medium text-text-primary">Escaneie o QR Code para pagar</p>

                                            <div className="inline-block p-4 bg-white rounded-xl">
                                                <img src={`data:image/png;base64,${pixQrCode}`} alt="QR Code PIX" className="w-48 h-48" />
                                            </div>

                                            {pixCopyPaste && (
                                                <div>
                                                    <p className="text-sm text-text-secondary mb-2">Ou copie o código:</p>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={pixCopyPaste}
                                                            readOnly
                                                            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-xs truncate"
                                                        />
                                                        <button
                                                            onClick={copyPixCode}
                                                            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${pixCopied
                                                                ? 'bg-green-500 text-white'
                                                                : 'bg-primary text-white hover:bg-primary/90'
                                                                }`}
                                                        >
                                                            {pixCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                            {pixCopied ? 'Copiado!' : 'Copiar'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <p className="text-xs text-text-muted">O pagamento será confirmado automaticamente</p>
                                        </div>
                                    ) : paymentStatus === 'processing' ? (
                                        <div className="text-center py-8">
                                            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
                                            <p className="text-text-secondary">Gerando QR Code...</p>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>
            <DebugModal
                isOpen={debugOpen}
                onClose={() => setDebugOpen(false)}
                logs={logs}
                title="Checkout Debug"
            />
        </div>
    );
}
