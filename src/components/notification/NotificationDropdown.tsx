
import { useState, useRef, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export function NotificationDropdown() {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleNotificationClick = async (id: string, read: boolean) => {
        if (!read) {
            await markAsRead(id);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-text-secondary hover:text-primary transition-colors relative"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 text-[10px] flex items-center justify-center bg-primary text-white rounded-full border border-background">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-surface rounded-xl shadow-2xl border border-border overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-3 border-b border-border flex justify-between items-center bg-muted">
                        <h3 className="font-semibold text-sm">Notificações</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => markAllAsRead()}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                <Check size={12} /> Marcar todas como lidas
                            </button>
                        )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-text-secondary text-sm">
                                Nenhuma notificação
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification.id, notification.read)}
                                        className={`p-4 hover:bg-muted/50 transition-colors cursor-pointer flex gap-3 ${!notification.read ? 'bg-primary/5' : ''}`}
                                    >
                                        <div className={`mt-1 min-w-[8px] h-2 rounded-full ${!notification.read ? 'bg-primary' : 'bg-transparent'}`} />
                                        <div>
                                            <h4 className={`text-sm font-medium mb-1 ${!notification.read ? 'text-text-primary' : 'text-text-secondary'}`}>
                                                {notification.title}
                                            </h4>
                                            <p className="text-xs text-text-secondary leading-relaxed">
                                                {notification.message}
                                            </p>
                                            <span className="text-[10px] text-text-tertiary mt-2 block">
                                                {new Date(notification.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
