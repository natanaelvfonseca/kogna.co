import { useState } from 'react';
import { User, Building, Mail, Phone, Lock, Save, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

export function ProfileSettings() {
    const { user, token, refreshUser } = useAuth();
    const { showToast } = useNotifications();
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        companyName: user?.organization?.name || '',
        personalPhone: (user as any)?.personal_phone || '',
        companyPhone: (user as any)?.company_phone || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setStatus(null);

        try {
            const apiBase = '';
            const res = await fetch(`${apiBase}/api/profile/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    companyName: formData.companyName,
                    personalPhone: formData.personalPhone,
                    companyPhone: formData.companyPhone
                })
            });

            if (res.ok) {
                showToast('Perfil atualizado', 'Suas informações foram salvas com sucesso!', 'success');
                if (refreshUser) await refreshUser();
            } else {
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await res.json();
                    throw new Error(data.error || 'Falha ao atualizar perfil');
                } else {
                    const text = await res.text();
                    console.error('Server error:', text);
                    throw new Error(`Erro no servidor (${res.status}): Verifique se o backend foi reiniciado.`);
                }
            }
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.newPassword !== formData.confirmPassword) {
            setStatus({ type: 'error', message: 'As senhas não coincidem' });
            return;
        }

        setIsSaving(true);
        try {
            const apiBase = '';
            const res = await fetch(`${apiBase}/api/profile/change-password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword
                })
            });

            if (res.ok) {
                showToast('Senha alterada', 'Sua senha foi atualizada com sucesso!', 'success');
                setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Falha ao alterar senha');
            }
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-4xl space-y-8 animate-fade-in">
            {status && (
                <div className={`p-4 rounded-xl border ${status.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                    : 'bg-red-500/10 border-red-500/20 text-red-500'
                    }`}>
                    {status.message}
                </div>
            )}

            {/* Informações Pessoais & Empresa */}
            <section className="bg-surface border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border/50 bg-surface/50">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <User size={20} className="text-primary" />
                        Informações do Perfil
                    </h3>
                </div>

                <form onSubmit={handleSaveProfile} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Nome Completo</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full bg-background border border-border/50 rounded-xl py-2 pl-10 pr-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full bg-background border border-border/50 rounded-xl py-2 pl-10 pr-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Nome da Empresa</label>
                        <div className="relative">
                            <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                            <input
                                type="text"
                                name="companyName"
                                value={formData.companyName}
                                onChange={handleChange}
                                className="w-full bg-background border border-border/50 rounded-xl py-2 pl-10 pr-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Telefone Pessoal</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                            <input
                                type="text"
                                name="personalPhone"
                                value={formData.personalPhone}
                                onChange={handleChange}
                                placeholder="(00) 00000-0000"
                                className="w-full bg-background border border-border/50 rounded-xl py-2 pl-10 pr-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Telefone da Empresa</label>
                        <div className="relative">
                            <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                            <input
                                type="text"
                                name="companyPhone"
                                value={formData.companyPhone}
                                onChange={handleChange}
                                placeholder="(00) 0000-0000"
                                className="w-full bg-background border border-border/50 rounded-xl py-2 pl-10 pr-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2 pt-4">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-70"
                        >
                            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            Salvar Alterações
                        </button>
                    </div>
                </form>
            </section>

            {/* Alterar Senha */}
            <section className="bg-surface border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border/50 bg-surface/50">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <Lock size={20} className="text-primary" />
                        Segurança & Senha
                    </h3>
                </div>

                <form onSubmit={handleChangePassword} className="p-6 space-y-6 max-w-md">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Senha Atual</label>
                        <input
                            type="password"
                            name="currentPassword"
                            value={formData.currentPassword}
                            onChange={handleChange}
                            className="w-full bg-background border border-border/50 rounded-xl py-2 px-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Nova Senha</label>
                        <input
                            type="password"
                            name="newPassword"
                            value={formData.newPassword}
                            onChange={handleChange}
                            className="w-full bg-background border border-border/50 rounded-xl py-2 px-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Confirmar Nova Senha</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className="w-full bg-background border border-border/50 rounded-xl py-2 px-4 text-text-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="bg-surfaceHover hover:bg-border/20 text-text-primary border border-border/50 px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 disabled:opacity-70"
                    >
                        Alterar Senha
                    </button>
                </form>
            </section>
        </div>
    );
}
