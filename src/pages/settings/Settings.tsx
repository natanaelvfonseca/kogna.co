import { useState, useEffect } from 'react';
import { LeadsSettings } from './LeadsSettings';
import { IntegrationsSettings } from './IntegrationsSettings';
import { Users, Layout, Globe } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ProfileSettings } from './ProfileSettings';

export function Settings() {
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    const renderContent = () => {
        switch (activeTab) {
            case 'profile':
                return <ProfileSettings />;
            case 'leads':
                return <LeadsSettings />;
            case 'integrations':
                return <IntegrationsSettings />;
            default:
                return (
                    <div className="bg-surface border border-border/50 rounded-xl p-8 text-center">
                        <p className="text-text-muted">Configuração em desenvolvimento.</p>
                    </div>
                );
        }
    };

    const tabs = [
        { id: 'profile', label: 'Perfil', icon: Users },
        { id: 'leads', label: 'Leads & CRM', icon: Layout },
        { id: 'integrations', label: 'Integrações', icon: Globe },
    ];

    return (
        <div className="h-full flex flex-col p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-text-primary">Configurações</h1>
                <p className="text-text-secondary text-sm">Gerencie sua conta e preferências do sistema</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
                {/* Sidebar Navigation */}
                <div className="w-full lg:w-64 flex-shrink-0 space-y-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium
                                ${activeTab === tab.id
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'text-text-secondary hover:bg-surfaceHover hover:text-text-primary border border-transparent'
                                }`}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide pb-10">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
