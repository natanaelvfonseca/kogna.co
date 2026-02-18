import { Zap, Bot, Briefcase, Upload, CheckCircle2 } from 'lucide-react';


interface StepIndicatorProps {
    currentStep: number;
}

const steps = [
    { number: 0, title: 'Preparação', icon: Zap },
    { number: 1, title: 'Modelo IA', icon: Bot },
    { number: 2, title: 'Negócio', icon: Briefcase },
    { number: 3, title: 'Treinamento', icon: Upload },
    { number: 4, title: 'Conexão', icon: CheckCircle2 },
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
    return (
        <div className="w-full mb-8">
            <div className="flex items-center justify-between relative">
                {/* Connecting Line */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-border -z-10 rounded-full" />
                <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
                />

                {steps.map((step, index) => {
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;
                    const Icon = step.icon;

                    return (
                        <div key={step.number} className="flex flex-col items-center gap-2 bg-background px-1">
                            <div
                                className={`
                                    w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300
                                    ${isActive ? 'border-primary bg-primary text-white scale-110 shadow-lg shadow-primary/30' : ''}
                                    ${isCompleted ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground bg-background'}
                                `}
                            >
                                {isCompleted ? (
                                    <CheckCircle2 size={18} />
                                ) : (
                                    <Icon size={16} />
                                )}
                            </div>
                            <span
                                className={`
                                    text-[10px] font-medium transition-colors whitespace-nowrap
                                    ${isActive || isCompleted ? 'text-primary' : 'text-muted-foreground'}
                                `}
                            >
                                {step.title}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
